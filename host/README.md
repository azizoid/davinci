# Resolve Host Bridge

The bridge is the native macOS boundary between the Docker editor and DaVinci Resolve's scripting API. It must run on the host because Resolve's scripting module and application process are native macOS components.

Resolve must be running with external scripting enabled. The bridge listens only on `127.0.0.1:8787` and accepts the versioned operation plan produced by the container.
