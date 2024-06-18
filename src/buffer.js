/**
 * Manages the buffering and quality switching for a media player.
 *
 * The `BufferManager` class is responsible for monitoring the media player's buffer
 * level and adjusting the video quality accordingly. It keeps track of the
 * available video variants, the current playback rate, and the buffer level.
 * It provides methods to enable/disable the buffer management, choose the
 * appropriate video variant based on the buffer level, and handle segment
 * downloads.
 */
export class BufferManager {
  constructor(getBufferFullnessCallback) {
    this.switchQualityCallback = null;
    this.mediaElement = null;
    this.enabled_ = false;

    this.videoVariants = [];
    this.getBufferFullness = getBufferFullnessCallback;
    this.downloadedSegments = [];
    this.playbackRate = 1;
    this.isStartupComplete = false;
    this.playbackRate_ = 1;
    this.monitorInterval = 1000;
    this.lastQualityChangeTime = null;
    this.config_ = null;

    this.cmsdManager = null;
    this.lastDownloadedSegments = null;
    this.highBufferThreshold = 0.8;
    this.lowBufferThreshold = 0.3;
    this.bufferPercentage = 10;
    this.currentQualityIndex = 0;
    this.bufferLevel = 0;
    this.startMonitoring();
    this.startMonitoringBuffer();
  }

  init(switchQualityCallback) {
    this.switchQualityCallback = switchQualityCallback;
  }

  setMediaElement(mediaElement) {
    this.mediaElement = mediaElement;
  }

  stop() {
    this.switchQualityCallback = null;
    this.isEnabled = false;
    this.videoVariants = [];
    this.playbackRate = 1;

    this.lastQualityChangeTime = null;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.cmsdManager = null;
  }

  release() {}

  setVariants(variants) {
    this.videoVariants = variants;
  }

  /**
   * Chooses the appropriate video variant based on the current buffer level.
   * If the buffer level is below the low buffer threshold, the quality is decreased.
   * If the buffer level is above the high buffer threshold, the quality is increased.
   * The chosen variant is returned.
   *
   * @param {boolean} [preferFastSwitching] - Whether to prefer fast switching over quality.
   * @returns {Object} - The chosen video variant.
   */
  chooseVariant(preferFastSwitching) {
    const bufferLevel = this.bufferLevel;
    if (bufferLevel < this.lowBufferThreshold) {
      this.decreaseQuality();
    } else if (bufferLevel > this.highBufferThreshold) {
      this.increaseQuality();
    }

    return this.getVariantByQualityIndex(this.currentQualityIndex);
  }

  decreaseQuality() {
    if (this.currentQualityIndex > 0) {
      this.currentQualityIndex--;
      this.restrictions(
        this.getVariantByQualityIndex(this.currentQualityIndex).bandwidth
      );
      console.log(`Decreasing quality to: ${this.currentQualityIndex}`);
    }
  }

  increaseQuality() {
    const maxQualityIndex = this.videoVariants.length - 1;

    if (this.currentQualityIndex < maxQualityIndex) {
      this.currentQualityIndex++;
      this.restrictions(
        this.getVariantByQualityIndex(this.currentQualityIndex).bandwidth
      );
      this.config_.restrictToScreenSize = true;
      console.log(`Increasing quality to: ${this.currentQualityIndex}`);
    }
  }
  enable() {
    this.enabled_ = true;
  }

  disable() {
    this.enabled_ = false;
  }

  startMonitoringBuffer() {
    // this.config_.useNetworkInformation = false;

    const bufferFullness = this.getBufferFullness().toFixed(1);
    this.bufferLevel = bufferFullness;
    const chosenVariant = this.chooseVariant();
    if (chosenVariant) {
      this.switchQualityCallback(
        chosenVariant,
        this.config_.safeMarginSwitch,
        this.config_.clearBufferSwitch
      );
    }
  }
  restrictions(bandwidth) {
    this.config_.restrictions.maxBandwidth = bandwidth;
  }
  getDownloadedSegments() {
    return this.downloadedSegments;
  }

  getVariantByQualityIndex(qualityIndex) {
    const sortedVariants = this.videoVariants.sort(
      (a, b) => a.bandwidth - b.bandwidth
    );
    return sortedVariants[qualityIndex];
  }
  /**
   * Handles the completion of a segment download.
   *
   * @param {number} deltaTimeMs - The duration, in milliseconds, that the request took to complete.
   * @param {number} numBytes - The total number of bytes transferred.
   * @param {boolean} allowSwitch - Indicate if the segment is allowed to switch to another stream.
   * @param {shaka.extern.Request} [request] - A reference to the request.
   */
  segmentDownloaded(deltaTimeMs, numBytes, allowSwitch, request) {
    if (allowSwitch) {
      this.startMonitoringBuffer();
    }

    // Menghitung latency
    const liveLatency = deltaTimeMs + (request.timeToFirstByte || 0); // Menggunakan 0 jika timeToFirstByte tidak didefinisikan
    // console.log(`Latency: ${liveLatency} ms`);

    // Mencatat data segmen yang diunduh
    const segmentData = {
      contentType: request.contentType,
      timestamp: Date.now(),
      latency: liveLatency,
    };
    this.downloadedSegments.push(segmentData);
  }

  startMonitoring() {
    setInterval(() => {
      const currentTime = Date.now();
      const recentSegments = this.downloadedSegments.filter(
        (segment) => currentTime - segment.timestamp <= 5000
      );
      this.lastDownloadedSegmentsCount = recentSegments.length;
      console.log(this.calculateDelay());
      // console.log(
      //   `Segments fetched in the last 5 seconds: ${this.lastDownloadedSegmentsCount}`
      // );
    }, 5000);
  }
  calculateDelay(videoTimestamp, audioTimestamp) {
    this.downloadedSegments.forEach((item) => {
      if (item.contentType === "video") {
        videoTimestamp = item.timestamp;
      } else if (item.contentType === "audio") {
        audioTimestamp = item.timestamp;
      }
    });
    return Math.abs(videoTimestamp - audioTimestamp);
  }
  getLatencyStatistics() {
    if (this.downloadedSegments.length === 0) {
      return null;
    }

    const latencies = this.downloadedSegments.map((segment) => segment.latency);
    const sum = latencies.reduce((a, b) => a + b, 0);
    const averageLatency = sum / latencies.length;
    const maxLatency = Math.max(...latencies);
    const minLatency = Math.min(...latencies);

    return {
      averageLatency,
      maxLatency,
      minLatency,
    };
  }

  addSegment(type, time) {
    this.downloadedSegments.push({ type, time });
  }

  getBandwidthEstimate() {}

  playbackRateChanged(rate) {
    this.playbackRate_ = rate;
  }

  setCmsdManager(cmsdManager) {}

  configure(config) {
    this.config_ = config;
  }
}
