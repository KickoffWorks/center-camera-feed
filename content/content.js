(function() {
  'use strict';

  const CONTAINER_ID = 'center-camera-feed-container';
  let isEnabled = false;
  let originalVideoParent = null;
  let originalVideoNextSibling = null;
  let clonedVideo = null;
  let observer = null;

  // Platform-specific selectors for self-view video
  const PLATFORM_SELECTORS = {
    'meet.google.com': [
      '[data-self-name]',
      '[data-participant-id*="self"]',
      'div[data-requested-participant-id] video'
    ],
    'zoom.us': [
      '.self-video video',
      '[class*="self-video"] video',
      '.video-avatar__avatar--self video'
    ],
    'teams.microsoft.com': [
      '[data-cid="calling-self-video"] video',
      '.ts-self-video video'
    ],
    'webex.com': [
      '.self-view video',
      '[class*="self-view"] video'
    ],
    'discord.com': [
      '[class*="localVideo"] video'
    ]
  };

  function getCurrentPlatform() {
    const hostname = window.location.hostname;
    for (const platform of Object.keys(PLATFORM_SELECTORS)) {
      if (hostname.includes(platform.replace('*.', ''))) {
        return platform;
      }
    }
    return null;
  }

  function findSelfVideo() {
    const platform = getCurrentPlatform();
    if (!platform) return null;

    const selectors = PLATFORM_SELECTORS[platform];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const video = element.tagName === 'VIDEO' ? element : element.querySelector('video');
        if (video && video.srcObject) {
          return video;
        }
      }
    }

    // Fallback: try to find any video that looks like a self-view
    const allVideos = document.querySelectorAll('video');
    for (const video of allVideos) {
      if (video.srcObject && video.muted) {
        return video;
      }
    }

    return null;
  }

  function createContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (container) return container;

    container = document.createElement('div');
    container.id = CONTAINER_ID;
    document.body.appendChild(container);

    // Make it draggable
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    container.addEventListener('mousedown', (e) => {
      if (e.target === container || e.target.classList.contains('ccf-drag-handle')) {
        isDragging = true;
        dragOffsetX = e.clientX - container.offsetLeft;
        dragOffsetY = e.clientY - container.offsetTop;
        container.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        container.style.left = (e.clientX - dragOffsetX) + 'px';
        container.style.top = (e.clientY - dragOffsetY) + 'px';
        container.style.transform = 'none';
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      container.style.cursor = 'grab';
    });

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ccf-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Hide (use extension popup to show again)';
    closeBtn.addEventListener('click', () => {
      disable();
      chrome.storage.local.set({ enabled: false });
    });
    container.appendChild(closeBtn);

    // Add drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'ccf-drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.title = 'Drag to move';
    container.appendChild(dragHandle);

    return container;
  }

  function cloneVideoToContainer(sourceVideo) {
    const container = createContainer();

    // Remove existing cloned video if any
    if (clonedVideo && clonedVideo.parentNode) {
      clonedVideo.parentNode.removeChild(clonedVideo);
    }

    // Clone the video element
    clonedVideo = document.createElement('video');
    clonedVideo.className = 'ccf-video';
    clonedVideo.autoplay = true;
    clonedVideo.muted = true;
    clonedVideo.playsInline = true;

    // Copy the stream
    if (sourceVideo.srcObject) {
      clonedVideo.srcObject = sourceVideo.srcObject;
    }

    container.appendChild(clonedVideo);
    container.style.display = 'flex';

    return clonedVideo;
  }

  function enable() {
    if (isEnabled) return;

    const selfVideo = findSelfVideo();
    if (!selfVideo) {
      console.log('Center Camera Feed: Could not find self-view video. Retrying...');
      setTimeout(enable, 2000);
      return;
    }

    cloneVideoToContainer(selfVideo);
    isEnabled = true;

    // Watch for video source changes
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      if (isEnabled && clonedVideo) {
        const currentVideo = findSelfVideo();
        if (currentVideo && currentVideo.srcObject !== clonedVideo.srcObject) {
          clonedVideo.srcObject = currentVideo.srcObject;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcObject']
    });

    console.log('Center Camera Feed: Enabled');
  }

  function disable() {
    if (!isEnabled) return;

    const container = document.getElementById(CONTAINER_ID);
    if (container) {
      container.style.display = 'none';
    }

    if (clonedVideo) {
      clonedVideo.srcObject = null;
    }

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    isEnabled = false;
    console.log('Center Camera Feed: Disabled');
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggle') {
      if (message.enabled) {
        enable();
      } else {
        disable();
      }
      sendResponse({ success: true, enabled: isEnabled });
    } else if (message.action === 'getStatus') {
      sendResponse({ enabled: isEnabled });
    }
    return true;
  });

  // Check initial state
  chrome.storage.local.get(['enabled'], (result) => {
    if (result.enabled) {
      // Wait for page to load before enabling
      if (document.readyState === 'complete') {
        setTimeout(enable, 1000);
      } else {
        window.addEventListener('load', () => setTimeout(enable, 1000));
      }
    }
  });
})();
