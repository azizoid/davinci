# Video Projects

Each processed source gets a project folder. The generated editor currently creates this shape:

```text
projects/<video-slug>/
|-- raw/                 # immutable source copy
|-- final.mp4            # latest validated render
|-- captions.srt
|-- assets/              # future B-roll and supporting media
|-- thumbnails/          # future generated thumbnails
|-- shorts/              # future short-form exports
|-- social/              # future titles, descriptions, and tags
|-- project.json
`-- .work/               # private resumable pipeline artifacts
```

Large media and `.work/` are ignored by Git. Project metadata and plans can be committed separately.
