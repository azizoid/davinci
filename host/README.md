# Resolve Host Bridge

The bridge is an optional native macOS boundary between the Docker editor and DaVinci Resolve's scripting API. It must run on the host because Resolve's scripting module and application process are native macOS components.

The default regular-Resolve test does not use this bridge; it creates an FCPXML file for manual import. The bridge is for an installation with external scripting available, listens only on `127.0.0.1:8787`, and accepts the versioned operation plan produced by the container.
