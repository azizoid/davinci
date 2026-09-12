#!/usr/bin/env python3
"""Small native Resolve host adapter for the first E2E test."""

import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import DaVinciResolveScript as dvr_script


HOST_PROJECT_ROOT = Path(os.environ.get("HOST_PROJECT_ROOT", Path.cwd())).resolve()
PORT = int(os.environ.get("RESOLVE_BRIDGE_PORT", "8787"))


def resolve_path(container_path: str) -> Path:
    if container_path.startswith("/workspace/"):
        candidate = HOST_PROJECT_ROOT / container_path.removeprefix("/workspace/")
    else:
        candidate = Path(container_path)
    candidate = candidate.resolve()
    try:
        candidate.relative_to(HOST_PROJECT_ROOT)
    except ValueError as error:
        raise ValueError(f"Path is outside HOST_PROJECT_ROOT: {container_path}") from error
    return candidate


def connect_resolve():
    resolve = dvr_script.scriptapp("Resolve")
    if resolve is None:
        raise RuntimeError(
            "Could not connect to DaVinci Resolve. Open Resolve and enable external scripting in Preferences."
        )
    return resolve


def snapshot_timeline(timeline):
    items = []
    for track_type in ("video", "audio"):
        try:
            track_items = timeline.GetItemListInTrack(track_type, 1) or []
        except Exception:
            track_items = []
        for item in track_items:
            items.append(
                {
                    "track_type": track_type,
                    "name": item.GetName(),
                    "start_frame": item.GetStart(),
                    "end_frame": item.GetEnd(),
                    "source_start_frame": item.GetSourceStartFrame(),
                    "source_end_frame": item.GetSourceEndFrame(),
                }
            )
    return {
        "timeline_name": timeline.GetName(),
        "timeline_id": timeline.GetUniqueId(),
        "items": items,
    }


def choose_render_codec(project):
    formats = project.GetRenderFormats() or {}
    format_name = "mp4" if "mp4" in formats else next(iter(formats), None)
    if not format_name:
        raise RuntimeError("Resolve reported no render formats.")

    codecs = project.GetRenderCodecs(format_name) or {}
    codec_name = None
    for key, value in codecs.items():
        if "h264" in str(key).lower() or "h264" in str(value).lower():
            codec_name = value if isinstance(value, str) else key
            break
    if codec_name:
        project.SetCurrentRenderFormatAndCodec(format_name, codec_name)
    return format_name, codec_name


def execute(plan):
    target = plan["target"]
    source_path = resolve_path(target["source_path"])
    output_path = resolve_path(target["output_path"])
    project_export_path = resolve_path(target["project_export_path"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    project_export_path.parent.mkdir(parents=True, exist_ok=True)
    if not source_path.exists():
        raise RuntimeError(f"Resolve source does not exist: {source_path}")

    resolve = connect_resolve()
    project_manager = resolve.GetProjectManager()
    project_name = target["project_name"]
    existing_names = project_manager.GetProjectListInCurrentFolder() or []
    if project_name in existing_names:
        project = project_manager.LoadProject(project_name)
    else:
        project = project_manager.CreateProject(project_name)
    if project is None:
        raise RuntimeError(f"Could not create or load Resolve project: {project_name}")

    media_pool = project.GetMediaPool()
    imported = media_pool.ImportMedia([{"FilePath": str(source_path)}])
    if not imported:
        raise RuntimeError(f"Resolve could not import source media: {source_path}")
    media_item = imported[0]
    segments = plan.get("segments") or []
    if not segments:
        raise RuntimeError("Operation plan contains no kept source segments.")

    timeline_name = target["timeline_name"]
    timeline = media_pool.CreateTimelineFromClips(
        timeline_name,
        [
            {
                "mediaPoolItem": media_item,
                "startFrame": segments[0]["source_start_frame"],
                "endFrame": segments[0]["source_end_frame"] - 1,
            }
        ],
    )
    if timeline is None:
        timeline = media_pool.CreateEmptyTimeline(timeline_name)
        if timeline is None:
            raise RuntimeError(f"Could not create Resolve timeline: {timeline_name}")
        for segment in segments:
            appended = media_pool.AppendToTimeline(
                [
                    {
                        "mediaPoolItem": media_item,
                        "startFrame": segment["source_start_frame"],
                        "endFrame": segment["source_end_frame"] - 1,
                        "recordFrame": segment["timeline_start_frame"],
                    }
                ]
            )
            if not appended:
                raise RuntimeError(f"Could not append {segment['segment_id']} to Resolve timeline.")
    else:
        for segment in segments[1:]:
            appended = media_pool.AppendToTimeline(
                [
                    {
                        "mediaPoolItem": media_item,
                        "startFrame": segment["source_start_frame"],
                        "endFrame": segment["source_end_frame"] - 1,
                        "recordFrame": segment["timeline_start_frame"],
                    }
                ]
            )
            if not appended:
                raise RuntimeError(f"Could not append {segment['segment_id']} to Resolve timeline.")

    project.SetCurrentTimeline(timeline)
    project_manager.SaveProject()
    format_name, codec_name = choose_render_codec(project)
    render_settings = {
        "SelectAllFrames": True,
        "TargetDir": str(output_path.parent),
        "CustomName": output_path.stem,
        "ExportVideo": True,
        "ExportAudio": True,
        "VideoQuality": "Best",
        "AudioCodec": "aac",
        "ReplaceExistingFilesInPlace": True,
    }
    if not project.SetRenderSettings(render_settings):
        raise RuntimeError("Resolve rejected the render settings.")
    render_job_id = project.AddRenderJob()
    if not render_job_id:
        raise RuntimeError("Resolve could not create the render job.")
    if not project.StartRendering([render_job_id]):
        raise RuntimeError("Resolve could not start the render job.")

    while project.IsRenderingInProgress():
        time.sleep(1)
    status = project.GetRenderJobStatus(render_job_id) or {}
    if status.get("JobStatus") != "Complete":
        raise RuntimeError(f"Resolve render failed: {status}")
    if not output_path.exists():
        raise RuntimeError(f"Resolve reported completion but output is missing: {output_path}")
    if not project_manager.ExportProject(project_name, str(project_export_path), True):
        raise RuntimeError(f"Resolve could not export project: {project_export_path}")

    return {
        "project_name": project_name,
        "timeline_name": timeline_name,
        "render_path": str(output_path),
        "project_export_path": str(project_export_path),
        "render_format": format_name,
        "render_codec": codec_name,
        "render_status": status,
        "timeline_snapshot": snapshot_timeline(timeline),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format_string, *args):
        print(format_string % args, flush=True)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            try:
                resolve = connect_resolve()
                self.send_json(200, {"ok": True, "resolve_version": resolve.GetVersion()})
            except Exception as error:
                self.send_json(503, {"ok": False, "error": str(error)})
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/execute":
            self.send_json(404, {"error": "not found"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            plan = json.loads(self.rfile.read(size))
            self.send_json(200, execute(plan))
        except Exception as error:
            self.send_json(500, {"ok": False, "error": str(error)})


if __name__ == "__main__":
    print(f"Resolve bridge listening on http://127.0.0.1:{PORT}", flush=True)
    print(f"Project root: {HOST_PROJECT_ROOT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
