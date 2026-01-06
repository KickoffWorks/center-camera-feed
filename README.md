# Center Camera Feed

A browser extension that moves your self-view video feed to the top center of the screen during video calls. This helps you maintain better eye contact by positioning your video near your webcam.

## Why?

During video calls, we often look at the other participants or our own video feed, which is usually positioned to the side of the screen. This makes it appear like we're looking away from the camera. By centering your self-view at the top of the screen (where most webcams are located), you can glance at yourself while appearing to look directly at the camera.

## Features

- Moves your self-view to the top center of the screen
- Draggable window - position it exactly where your camera is
- One-click toggle on/off
- Works across major video conferencing platforms
- Minimal, non-intrusive design
- Mirrored video (natural self-view)

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
   git clone https://github.com/YOUR_USERNAME/center-camera-feed.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the cloned repository folder

5. The extension icon should appear in your toolbar

### Icons

Before using, you'll need to add icon files to the `icons/` directory:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

You can use any camera/video icon or create your own.

## Usage

1. Join a video call on any supported platform
2. Click the extension icon in your toolbar
3. Toggle the switch to "Enabled"
4. Your self-view will appear at the top center of the screen
5. Drag the window to align it with your webcam
6. Click the X button or toggle off to hide

## How It Works

The extension detects your self-view video element on the page and creates a floating copy at the top center of your screen. The original video remains in place (so the platform continues to work normally), while you get a convenient reference point near your camera.

## Privacy

This extension:
- Does NOT access your camera directly
- Does NOT record or transmit any video
- Does NOT collect any data
- Only clones the existing video element that's already on the page
- All processing happens locally in your browser

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.
