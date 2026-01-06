(function() {
  'use strict';

  const CONTAINER_ID = 'center-camera-feed-container';
  const PICKER_OVERLAY_ID = 'ccf-picker-overlay';

  // State
  let isEnabled = false;
  let activeVideo = null;
  let observer = null;
  let activeSpeakerObserver = null;
  let pollInterval = null;
  let isPickerMode = false;
  let manuallySelectedVideo = null; // User-picked video element

  // For restoring moved videos
  let movedVideoData = null;

  let currentSettings = {
    position: 'top-center',
    videoSource: 'self', // 'self' or 'active-speaker'
    displayMode: 'move', // 'move' (default) or 'mirror'
    customPosition: null,
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
      ]
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
      ]
    },
    'teams.microsoft.com': {
      selfVideo: [
        '[data-cid="calling-self-video"] video',
        '.ts-self-video video'
      ],
      activeSpeaker: [
        '[data-cid="active-speaker-video"] video',
        '.ts-active-speaker video'
      ]
    },
    'webex.com': {
      selfVideo: [
        '.self-view video',
        '[class*="self-view"] video'
      ],
      activeSpeaker: [
        '.active-speaker video',
        '[class*="active-speaker"] video'
      ]
    },
    'discord.com': {
      selfVideo: [
        '[class*="localVideo"] video'
      ],
      activeSpeaker: [
        '[class*="speaking"]:not([class*="localVideo"]) video',
        '[class*="voiceUser"][class*="speaking"] video'
      ]
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
    // If user manually selected a video, use that
    if (manuallySelectedVideo && manuallySelectedVideo.srcObject && document.contains(manuallySelectedVideo)) {
      return manuallySelectedVideo;
    }

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
    // If user manually selected a video for active speaker, use that
    if (manuallySelectedVideo && manuallySelectedVideo.srcObject && document.contains(manuallySelectedVideo)) {
      return manuallySelectedVideo;
    }

    const platform = getCurrentPlatform();
    if (!platform) return null;

    const config = PLATFORM_CONFIG[platform];
    let video = findVideo(config.activeSpeaker);

    if (!video) {
      video = findActiveSpeakerFallback();
    }

    return video;
  }

  function findActiveSpeakerFallback() {
    const allVideos = document.querySelectorAll('video');
    let largestVideo = null;
    let largestArea = 0;

    for (const video of allVideos) {
      if (!video.srcObject || video.muted) continue;
      if (video.classList.contains('ccf-video')) continue;

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
    }
    return findSelfVideo();
  }

  // ==================== PICKER MODE ====================

  function getAllVideosOnPage() {
    const videos = [];
    document.querySelectorAll('video').forEach(video => {
      if (video.srcObject && !video.classList.contains('ccf-video')) {
        videos.push(video);
      }
    });
    return videos;
  }

  function createPickerOverlay() {
    let overlay = document.getElementById(PICKER_OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = PICKER_OVERLAY_ID;
    overlay.innerHTML = `
      <div class="ccf-picker-header">
        <span>Click on a video to select it</span>
        <button class="ccf-picker-cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.ccf-picker-cancel').addEventListener('click', cancelPicker);

    return overlay;
  }

  function startPicker() {
    if (isPickerMode) return;
    isPickerMode = true;

    const overlay = createPickerOverlay();
    overlay.style.display = 'block';

    const videos = getAllVideosOnPage();

    if (videos.length === 0) {
      cancelPicker();
      return { success: false, message: 'No videos found on page' };
    }

    // Add highlight handlers to all videos
    videos.forEach(video => {
      video.classList.add('ccf-picker-candidate');
      video.addEventListener('mouseenter', handlePickerHover);
      video.addEventListener('mouseleave', handlePickerUnhover);
      video.addEventListener('click', handlePickerClick);
    });

    // Listen for escape key
    document.addEventListener('keydown', handlePickerEscape);

    return { success: true, videoCount: videos.length };
  }

  function handlePickerHover(e) {
    e.target.classList.add('ccf-picker-highlight');
  }

  function handlePickerUnhover(e) {
    e.target.classList.remove('ccf-picker-highlight');
  }

  function handlePickerClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const selectedVideo = e.target;
    manuallySelectedVideo = selectedVideo;

    // Clear the manual selection marker from storage to indicate manual pick
    chrome.storage.local.set({ hasManualSelection: true });

    endPicker();

    // If extension is enabled, update the video
    if (isEnabled) {
      setupVideoInContainer(selectedVideo);
    }

    // Notify popup
    chrome.runtime.sendMessage({ action: 'videoPicked', success: true });
  }

  function handlePickerEscape(e) {
    if (e.key === 'Escape') {
      cancelPicker();
    }
  }

  function cancelPicker() {
    endPicker();
    chrome.runtime.sendMessage({ action: 'videoPicked', success: false, cancelled: true });
  }

  function endPicker() {
    isPickerMode = false;

    const overlay = document.getElementById(PICKER_OVERLAY_ID);
    if (overlay) {
      overlay.style.display = 'none';
    }

    // Remove highlight handlers from all videos
    document.querySelectorAll('.ccf-picker-candidate').forEach(video => {
      video.classList.remove('ccf-picker-candidate', 'ccf-picker-highlight');
      video.removeEventListener('mouseenter', handlePickerHover);
      video.removeEventListener('mouseleave', handlePickerUnhover);
      video.removeEventListener('click', handlePickerClick);
    });

    document.removeEventListener('keydown', handlePickerEscape);
  }

  function clearManualSelection() {
    manuallySelectedVideo = null;
    chrome.storage.local.remove('hasManualSelection');
  }

  // ==================== CONTAINER & VIDEO ====================

  function createContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (container) return container;

    container = document.createElement('div');
    container.id = CONTAINER_ID;
    document.body.appendChild(container);

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

    const sourceIndicator = document.createElement('div');
    sourceIndicator.className = 'ccf-source-indicator';
    sourceIndicator.id = 'ccf-source-indicator';
    container.appendChild(sourceIndicator);

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
      let label = currentSettings.videoSource === 'active-speaker' ? 'Speaker' : 'You';
      if (manuallySelectedVideo) {
        label += ' (picked)';
      }
      indicator.textContent = label;
      indicator.className = 'ccf-source-indicator ' +
        (currentSettings.videoSource === 'active-speaker' ? 'ccf-source-speaker' : 'ccf-source-self');
    }
  }

  function restoreMovedVideo() {
    if (movedVideoData) {
      const { video, originalParent, originalNextSibling, originalStyles } = movedVideoData;

      video.style.cssText = originalStyles;
      video.classList.remove('ccf-video', 'ccf-video-moved');

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

    restoreMovedVideo();

    const existingVideo = container.querySelector('.ccf-video');
    if (existingVideo && existingVideo !== sourceVideo) {
      existingVideo.remove();
    }

    movedVideoData = {
      video: sourceVideo,
      originalParent: sourceVideo.parentNode,
      originalNextSibling: sourceVideo.nextSibling,
      originalStyles: sourceVideo.style.cssText
    };

    sourceVideo.classList.add('ccf-video', 'ccf-video-moved');
    sourceVideo.style.width = currentSettings.videoSize + 'px';
    sourceVideo.style.height = 'auto';
    sourceVideo.style.borderRadius = '8px';
    sourceVideo.style.pointerEvents = 'none';
    sourceVideo.style.position = 'static';
    sourceVideo.style.margin = '0';
    sourceVideo.style.padding = '0';

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

    restoreMovedVideo();

    const existingVideo = container.querySelector('.ccf-video');
    if (existingVideo) {
      existingVideo.remove();
    }

    const mirroredVideo = document.createElement('video');
    mirroredVideo.className = 'ccf-video ccf-video-mirrored';
    mirroredVideo.autoplay = true;
    mirroredVideo.muted = true;
    mirroredVideo.playsInline = true;

    mirroredVideo.style.width = currentSettings.videoSize + 'px';

    if (sourceVideo.srcObject) {
      mirroredVideo.srcObject = sourceVideo.srcObject;
    }

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
    // Don't auto-update if user manually selected a video
    if (manuallySelectedVideo && document.contains(manuallySelectedVideo)) {
      return;
    }

    const targetVideo = getTargetVideo();
    if (!targetVideo) return;

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

    pollInterval = setInterval(() => {
      if (!isEnabled) {
        clearInterval(pollInterval);
        pollInterval = null;
        return;
      }

      // Don't auto-switch if user manually selected
      if (manuallySelectedVideo) return;

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

    activeSpeakerObserver = new MutationObserver(() => {
      if (isEnabled && currentSettings.videoSource === 'active-speaker' && !manuallySelectedVideo) {
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

    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      if (isEnabled && !manuallySelectedVideo) {
        updateVideo();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcObject']
    });

    if (currentSettings.videoSource === 'active-speaker') {
      startActiveSpeakerDetection();
    }

    console.log('Center Camera Feed: Enabled (' + currentSettings.displayMode + ' mode)');
  }

  function disable() {
    if (!isEnabled) return;

    const container = document.getElementById(CONTAINER_ID);

    restoreMovedVideo();

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

    if (positionChanged) {
      currentSettings.customPosition = null;
      chrome.storage.local.remove('customPosition');
    }

    // Clear manual selection when video source changes
    if (sourceChanged) {
      clearManualSelection();
    }

    Object.assign(currentSettings, newSettings);

    if (isEnabled) {
      const container = document.getElementById(CONTAINER_ID);

      if (modeChanged || sourceChanged) {
        const targetVideo = getTargetVideo();
        if (targetVideo) {
          restoreMovedVideo();
          if (activeVideo && activeVideo.classList.contains('ccf-video-mirrored')) {
            activeVideo.srcObject = null;
            activeVideo.remove();
          }
          activeVideo = null;
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
      sendResponse({
        enabled: isEnabled,
        settings: currentSettings,
        hasManualSelection: !!manuallySelectedVideo
      });
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
    } else if (message.action === 'startPicker') {
      const result = startPicker();
      sendResponse(result);
    } else if (message.action === 'clearManualSelection') {
      clearManualSelection();
      if (isEnabled) {
        const targetVideo = getTargetVideo();
        if (targetVideo) {
          setupVideoInContainer(targetVideo);
        }
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
