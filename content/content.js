(function() {
  'use strict';

  const CONTAINER_ID = 'center-camera-feed-container';

  // State
  let isEnabled = false;
  let activeVideo = null; // The video currently in our container (moved or cloned)
  let observer = null;
  let activeSpeakerObserver = null;
  let pollInterval = null;

  // For restoring moved videos
  let movedVideoData = null; // { video, originalParent, originalNextSibling, originalStyles }

  let currentSettings = {
    position: 'top-center',
    videoSource: 'self', // 'self' or 'active-speaker'
    displayMode: 'move', // 'move' (default) or 'mirror'
    customPosition: null, // { x, y } for dragged position
    videoSize: 200
  };

  // Position presets
  const POSITION_PRESETS = {
    'top-left': { top: '10px', left: '10px', right: 'auto', bottom: 'auto', transform: 'none' },
    'top-center': { top: '10px', left: '50%', right: 'auto', bottom: 'auto', transform: 'translateX(-50%)' },
    'top-right': { top: '10px', left: 'auto', right: '10px', bottom: 'auto', transform: 'none' },
    'bottom-left': { top: 'auto', left: '10px', right: 'auto', bottom: '10px', transform: 'none' },
    'bottom-center': { top: 'auto', left: '50%', right: 'auto', bottom: '10px', transform: 'translateX(-50%)' },
    'bottom-right': { top: 'auto', left: 'auto', right: '10px', bottom: '10px', transform: 'none' }
  };

  // Platform-specific selectors
  const PLATFORM_CONFIG = {
    'meet.google.com': {
      selfVideo: [
        '[data-self-name] video',
        '[data-participant-id*="self"] video',
        '[data-is-local-active="true"] video'
      ],
      activeSpeaker: [
        '[data-participant-id][data-is-active="true"]:not([data-self-name]) video',
        '[data-active-speaker="true"] video'
      ],
      speakerIndicator: '[data-participant-id]'
    },
    'zoom.us': {
      selfVideo: [
        '.self-video video',
        '[class*="self-video"] video',
        '.video-avatar__avatar--self video'
      ],
      activeSpeaker: [
        '.speaker-active-container video',
        '[class*="active-speaker"] video',
        '.video-avatar__speaking video'
      ],
      speakerIndicator: '.video-avatar'
    },
    'teams.microsoft.com': {
      selfVideo: [
        '[data-cid="calling-self-video"] video',
        '.ts-self-video video'
      ],
      activeSpeaker: [
        '[data-cid="active-speaker-video"] video',
        '.ts-active-speaker video'
      ],
      speakerIndicator: '[data-cid]'
    },
    'webex.com': {
      selfVideo: [
        '.self-view video',
        '[class*="self-view"] video'
      ],
      activeSpeaker: [
        '.active-speaker video',
        '[class*="active-speaker"] video'
      ],
      speakerIndicator: '[class*="participant"]'
    },
    'discord.com': {
      selfVideo: [
        '[class*="localVideo"] video'
      ],
      activeSpeaker: [
        '[class*="speaking"]:not([class*="localVideo"]) video',
        '[class*="voiceUser"][class*="speaking"] video'
      ],
      speakerIndicator: '[class*="voiceUser"]'
    }
  };

  function getCurrentPlatform() {
    const hostname = window.location.hostname;
    for (const platform of Object.keys(PLATFORM_CONFIG)) {
      if (hostname.includes(platform.replace('*.', ''))) {
        return platform;
      }
    }
    return null;
  }

  function findVideo(selectors) {
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const video = element.tagName === 'VIDEO' ? element : element.querySelector('video');
          if (video && video.srcObject) {
            return video;
          }
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    return null;
  }

  function findSelfVideo() {
    const platform = getCurrentPlatform();
    if (!platform) return null;

    const config = PLATFORM_CONFIG[platform];
    let video = findVideo(config.selfVideo);

    // Fallback: find any muted video (usually self-view)
    if (!video) {
      const allVideos = document.querySelectorAll('video');
      for (const v of allVideos) {
        if (v.srcObject && v.muted && !v.classList.contains('ccf-video')) {
          video = v;
          break;
        }
      }
    }

    return video;
  }

  function findActiveSpeaker() {
    const platform = getCurrentPlatform();
    if (!platform) return null;

    const config = PLATFORM_CONFIG[platform];
    let video = findVideo(config.activeSpeaker);

    // Platform-specific fallbacks
    if (!video) {
      video = findActiveSpeakerFallback();
    }

    return video;
  }

  function findActiveSpeakerFallback() {
    // Try to find the largest non-self video (often the active speaker)
    const allVideos = document.querySelectorAll('video');
    let largestVideo = null;
    let largestArea = 0;

    for (const video of allVideos) {
      if (!video.srcObject || video.muted) continue; // Skip self-view (usually muted)
      if (video.classList.contains('ccf-video')) continue; // Skip our own video

      const rect = video.getBoundingClientRect();
      const area = rect.width * rect.height;

      if (area > largestArea) {
        largestArea = area;
        largestVideo = video;
      }
    }

    return largestVideo;
  }

  function getTargetVideo() {
    if (currentSettings.videoSource === 'active-speaker') {
      const activeSpeaker = findActiveSpeaker();
      if (activeSpeaker) return activeSpeaker;
      // Fall back to self if no active speaker found
    }
    return findSelfVideo();
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
        e.preventDefault();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const x = e.clientX - dragOffsetX;
        const y = e.clientY - dragOffsetY;

        container.style.left = x + 'px';
        container.style.top = y + 'px';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
        container.style.transform = 'none';

        // Save custom position
        currentSettings.customPosition = { x, y };
        chrome.storage.local.set({ customPosition: currentSettings.customPosition });
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        container.style.cursor = 'grab';
      }
    });

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ccf-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Hide (use extension popup to show again)';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      disable();
      chrome.storage.local.set({ enabled: false });
    });
    container.appendChild(closeBtn);

    // Add source indicator
    const sourceIndicator = document.createElement('div');
    sourceIndicator.className = 'ccf-source-indicator';
    sourceIndicator.id = 'ccf-source-indicator';
    container.appendChild(sourceIndicator);

    // Add drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'ccf-drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.title = 'Drag to move';
    container.appendChild(dragHandle);

    return container;
  }

  function applyPosition(container) {
    if (currentSettings.customPosition) {
      container.style.left = currentSettings.customPosition.x + 'px';
      container.style.top = currentSettings.customPosition.y + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
      container.style.transform = 'none';
    } else {
      const preset = POSITION_PRESETS[currentSettings.position] || POSITION_PRESETS['top-center'];
      Object.assign(container.style, preset);
    }
  }

  function updateSourceIndicator() {
    const indicator = document.getElementById('ccf-source-indicator');
    if (indicator) {
      indicator.textContent = currentSettings.videoSource === 'active-speaker' ? 'Speaker' : 'You';
      indicator.className = 'ccf-source-indicator ' +
        (currentSettings.videoSource === 'active-speaker' ? 'ccf-source-speaker' : 'ccf-source-self');
    }
  }

  function restoreMovedVideo() {
    if (movedVideoData) {
      const { video, originalParent, originalNextSibling, originalStyles } = movedVideoData;

      // Restore original styles
      video.style.cssText = originalStyles;
      video.classList.remove('ccf-video', 'ccf-video-moved');

      // Put video back in original location
      if (originalParent) {
        if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
          originalParent.insertBefore(video, originalNextSibling);
        } else {
          originalParent.appendChild(video);
        }
      }

      movedVideoData = null;
    }
  }

  function moveVideoToContainer(sourceVideo) {
    const container = createContainer();

    // Restore any previously moved video first
    restoreMovedVideo();

    // Remove any existing video in container
    const existingVideo = container.querySelector('.ccf-video');
    if (existingVideo && existingVideo !== sourceVideo) {
      existingVideo.remove();
    }

    // Save original location and styles
    movedVideoData = {
      video: sourceVideo,
      originalParent: sourceVideo.parentNode,
      originalNextSibling: sourceVideo.nextSibling,
      originalStyles: sourceVideo.style.cssText
    };

    // Move the video element to our container
    sourceVideo.classList.add('ccf-video', 'ccf-video-moved');
    sourceVideo.style.width = currentSettings.videoSize + 'px';
    sourceVideo.style.height = 'auto';
    sourceVideo.style.borderRadius = '8px';
    sourceVideo.style.pointerEvents = 'none';
    sourceVideo.style.position = 'static';
    sourceVideo.style.margin = '0';
    sourceVideo.style.padding = '0';

    // Mirror for self-view
    if (currentSettings.videoSource === 'self') {
      sourceVideo.style.transform = 'scaleX(-1)';
    } else {
      sourceVideo.style.transform = 'none';
    }

    container.appendChild(sourceVideo);
    activeVideo = sourceVideo;

    applyPosition(container);
    updateSourceIndicator();
    container.style.display = 'flex';

    return sourceVideo;
  }

  function mirrorVideoToContainer(sourceVideo) {
    const container = createContainer();

    // Restore any previously moved video first
    restoreMovedVideo();

    // Remove existing video if any
    const existingVideo = container.querySelector('.ccf-video');
    if (existingVideo) {
      existingVideo.remove();
    }

    // Create a new video element that mirrors the source
    const mirroredVideo = document.createElement('video');
    mirroredVideo.className = 'ccf-video ccf-video-mirrored';
    mirroredVideo.autoplay = true;
    mirroredVideo.muted = true;
    mirroredVideo.playsInline = true;

    // Apply size
    mirroredVideo.style.width = currentSettings.videoSize + 'px';

    // Copy the stream
    if (sourceVideo.srcObject) {
      mirroredVideo.srcObject = sourceVideo.srcObject;
    }

    // Mirror for self-view
    if (currentSettings.videoSource === 'self') {
      mirroredVideo.style.transform = 'scaleX(-1)';
    } else {
      mirroredVideo.style.transform = 'none';
    }

    container.appendChild(mirroredVideo);
    activeVideo = mirroredVideo;

    applyPosition(container);
    updateSourceIndicator();
    container.style.display = 'flex';

    return mirroredVideo;
  }

  function setupVideoInContainer(sourceVideo) {
    if (currentSettings.displayMode === 'move') {
      return moveVideoToContainer(sourceVideo);
    } else {
      return mirrorVideoToContainer(sourceVideo);
    }
  }

  function updateVideo() {
    const targetVideo = getTargetVideo();
    if (!targetVideo) return;

    // For move mode, check if it's a different video element
    // For mirror mode, check if the stream changed
    if (currentSettings.displayMode === 'move') {
      if (activeVideo !== targetVideo) {
        setupVideoInContainer(targetVideo);
      }
    } else {
      if (!activeVideo || activeVideo.srcObject !== targetVideo.srcObject) {
        mirrorVideoToContainer(targetVideo);
      }
    }
  }

  function startActiveSpeakerDetection() {
    if (activeSpeakerObserver) {
      activeSpeakerObserver.disconnect();
    }
    if (pollInterval) {
      clearInterval(pollInterval);
    }

    // Poll for active speaker changes
    pollInterval = setInterval(() => {
      if (!isEnabled) {
        clearInterval(pollInterval);
        pollInterval = null;
        return;
      }

      if (currentSettings.videoSource === 'active-speaker') {
        const newSpeaker = findActiveSpeaker();
        if (newSpeaker && activeVideo) {
          if (currentSettings.displayMode === 'move') {
            if (newSpeaker !== activeVideo) {
              setupVideoInContainer(newSpeaker);
            }
          } else {
            if (newSpeaker.srcObject !== activeVideo.srcObject) {
              activeVideo.srcObject = newSpeaker.srcObject;
              activeVideo.style.transform = 'none';
            }
          }
        }
      }
    }, 500);

    // Also use MutationObserver for faster detection
    activeSpeakerObserver = new MutationObserver(() => {
      if (isEnabled && currentSettings.videoSource === 'active-speaker') {
        updateVideo();
      }
    });

    activeSpeakerObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-is-active', 'data-active-speaker']
    });
  }

  function stopActiveSpeakerDetection() {
    if (activeSpeakerObserver) {
      activeSpeakerObserver.disconnect();
      activeSpeakerObserver = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function enable() {
    if (isEnabled) return;

    const targetVideo = getTargetVideo();
    if (!targetVideo) {
      console.log('Center Camera Feed: Could not find video. Retrying...');
      setTimeout(enable, 2000);
      return;
    }

    setupVideoInContainer(targetVideo);
    isEnabled = true;

    // Watch for video source changes
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      if (isEnabled) {
        updateVideo();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcObject']
    });

    // Start active speaker detection if needed
    if (currentSettings.videoSource === 'active-speaker') {
      startActiveSpeakerDetection();
    }

    console.log('Center Camera Feed: Enabled (' + currentSettings.displayMode + ' mode)');
  }

  function disable() {
    if (!isEnabled) return;

    const container = document.getElementById(CONTAINER_ID);

    // Restore moved video to original location
    restoreMovedVideo();

    // For mirrored videos, just clear the stream
    if (activeVideo && activeVideo.classList.contains('ccf-video-mirrored')) {
      activeVideo.srcObject = null;
      activeVideo.remove();
    }

    activeVideo = null;

    if (container) {
      container.style.display = 'none';
    }

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    stopActiveSpeakerDetection();

    isEnabled = false;
    console.log('Center Camera Feed: Disabled');
  }

  function updateSettings(newSettings) {
    const positionChanged = newSettings.position && newSettings.position !== currentSettings.position;
    const sourceChanged = newSettings.videoSource && newSettings.videoSource !== currentSettings.videoSource;
    const sizeChanged = newSettings.videoSize && newSettings.videoSize !== currentSettings.videoSize;
    const modeChanged = newSettings.displayMode && newSettings.displayMode !== currentSettings.displayMode;

    // Reset custom position if preset position changed
    if (positionChanged) {
      currentSettings.customPosition = null;
      chrome.storage.local.remove('customPosition');
    }

    Object.assign(currentSettings, newSettings);

    if (isEnabled) {
      const container = document.getElementById(CONTAINER_ID);

      // If display mode changed, need to re-setup the video
      if (modeChanged) {
        const targetVideo = getTargetVideo();
        if (targetVideo) {
          // Restore any moved video first
          restoreMovedVideo();
          // Remove any mirrored video
          if (activeVideo && activeVideo.classList.contains('ccf-video-mirrored')) {
            activeVideo.srcObject = null;
            activeVideo.remove();
          }
          activeVideo = null;
          // Re-setup with new mode
          setupVideoInContainer(targetVideo);
        }
      }

      if (container) {
        if (positionChanged) {
          applyPosition(container);
        }
        if (sizeChanged && activeVideo) {
          activeVideo.style.width = currentSettings.videoSize + 'px';
        }
      }

      if (sourceChanged) {
        updateVideo();
        if (currentSettings.videoSource === 'active-speaker') {
          startActiveSpeakerDetection();
        } else {
          stopActiveSpeakerDetection();
        }
      }
    }
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
      sendResponse({ enabled: isEnabled, settings: currentSettings });
    } else if (message.action === 'updateSettings') {
      updateSettings(message.settings);
      sendResponse({ success: true });
    } else if (message.action === 'resetPosition') {
      currentSettings.customPosition = null;
      chrome.storage.local.remove('customPosition');
      const container = document.getElementById(CONTAINER_ID);
      if (container) {
        applyPosition(container);
      }
      sendResponse({ success: true });
    }
    return true;
  });

  // Load initial settings
  chrome.storage.local.get(['enabled', 'position', 'videoSource', 'displayMode', 'customPosition', 'videoSize'], (result) => {
    if (result.position) currentSettings.position = result.position;
    if (result.videoSource) currentSettings.videoSource = result.videoSource;
    if (result.displayMode) currentSettings.displayMode = result.displayMode;
    if (result.customPosition) currentSettings.customPosition = result.customPosition;
    if (result.videoSize) currentSettings.videoSize = result.videoSize;

    if (result.enabled) {
      if (document.readyState === 'complete') {
        setTimeout(enable, 1000);
      } else {
        window.addEventListener('load', () => setTimeout(enable, 1000));
      }
    }
  });
})();
