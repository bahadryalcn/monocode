# Open connected-machine folders in Explorer

In the chat's remote folder browser, choose **Reveal in File Explorer** (Finder on macOS). The same action is available in a remote chat path's context menu.

On first use, enter the same folder's two addresses:

- Connected machine: for example `remote://<machine-id>/Users/dev/projects`.
- This computer: the share or mounted folder you already access, for example `\\MacBook\dev\projects` or `Z:\projects`. On macOS, use a mounted path such as `/Volumes/dev/projects`.

Use **Save and open**. MonoCode remembers the mapping on this computer, applies it to children, and prefers the most specific matching folder. **Shared folder settings** allows changing a saved mapping. The connected folder must contain the folder currently being browsed.

Explorer opens on the computer running MonoCode. An SSH connection alone does not create an SMB share or mount. Share access and authentication use the operating system's existing setup. Failed share access is shown in the folder browser; navigation inside MonoCode continues to use the connected host.

Source tests cover mapping boundaries, separate machines, Unicode/spaces, parent navigation at remote roots, local reveal routing, the first-use form, folder navigation and OS access errors. Packaged Windows/Mac interaction and a real network-share smoke test require separate verification.
