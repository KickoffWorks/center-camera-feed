# Center Camera Feed

A browser extension that positions a video feed near your webcam during video calls. This helps you maintain better eye contact by giving you a reference point to look at that's aligned with your camera.

## Why?

During video calls, we often look at the other participants or our own video feed, which is usually positioned to the side or bottom of the screen. This makes it appear like we're looking away from the camera. By positioning a video feed at the top of the screen (where most webcams are located), you can look at the video while appearing to make direct eye contact.

## Features

- **Display mode** - Choose between "Move" (relocates the original video element) or "Mirror" (creates a copy of the video stream)
- **Configurable position** - Choose from 6 preset positions (top-left, top-center, top-right, bottom-left, bottom-center, bottom-right) or drag to any custom position
- **Video source selection** - Show your own camera feed (mirrored) or the active speaker's video
- **Active speaker detection** - Automatically follows whoever is currently speaking
- **Adjustable size** - Resize the video window from 100px to 400px
- **Draggable window** - Position it exactly where your camera is
- **Persistent settings** - Your preferences are saved between sessions
- **One-click toggle** - Quickly enable/disable from the popup
- **Minimal design** - Non-intrusive floating window with subtle controls

## Supported Platforms

- Google Meet
- Zoom (web client)
- Microsoft Teams
- Webex
- Discord

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/KickoffWorks/center-camera-feed.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the cloned repository folder

5. The extension icon should appear in your toolbar

## Usage

1. Join a video call on any supported platform
2. Click the extension icon in your toolbar
3. Toggle the switch to "Enabled"
4. Configure your preferences:
   - **Video Source**: Choose "Your Camera" for self-view or "Active Speaker" to see who's talking
   - **Display Mode**: Choose "Move" to relocate the original video, or "Mirror" to create a copy
   - **Position**: Click a position preset or drag the window to a custom location
   - **Size**: Use the slider to adjust the video size
5. Drag the window to align it with your webcam
6. Click the X button or toggle off to hide

### Display Modes

- **Move** (default): Relocates the original video element from the page to the floating window. The video is restored to its original position when disabled. This is more efficient as it doesn't duplicate the video stream.

- **Mirror**: Creates a copy of the video stream in a new video element. The original video stays in place on the page. Use this if "Move" mode causes issues with a particular platform.

### Tips

- Position the video directly below your webcam for the most natural eye contact
- Use "Active Speaker" mode to keep track of who's talking without looking away from your camera
- Your custom position is saved automatically when you drag the window
- Click "Reset to preset position" to snap back to the selected preset
- If a platform doesn't work well with "Move" mode, try switching to "Mirror" mode

## How It Works

The extension detects video elements on the page using platform-specific selectors. In "Move" mode, it relocates the original video element to a floating container and restores it when disabled. In "Mirror" mode, it copies the video stream to a new element.

For self-view, it finds your muted video stream. For active speaker, it uses platform-specific selectors to identify who's currently speaking, with fallback detection based on video size.

## Privacy

This extension:
- Does NOT access your camera directly
- Does NOT record or transmit any video
- Does NOT collect any data
- Only moves or mirrors existing video elements that are already on the page
- All processing happens locally in your browser
- Settings are stored locally using Chrome's storage API

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.
