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
  constructor(getBufferFullnessCallback, player) {
    this.switchQualityCallback = null;
    this.mediaElement = null;
    this.enabled_ = false;
    this.player = player;
    this.videoVariants = [];
    this.getBufferFullness = getBufferFullnessCallback;
    this.downloadedSegments = [];
    this.failedSegments = [];
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
    this.setupErrorHandling();
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
    }
  }

  increaseQuality() {
    const maxQualityIndex = this.videoVariants.length - 1;

    if (this.currentQualityIndex < maxQualityIndex) {
      this.currentQualityIndex++;
      this.restrictions(
        this.getVariantByQualityIndex(this.currentQualityIndex).bandwidth
      );
    }
  }

  enable() {
    this.enabled_ = true;
  }

  disable() {
    this.enabled_ = false;
  }

  startMonitoringBuffer() {
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

  segmentDownloaded(deltaTimeMs, numBytes, allowSwitch, request) {
    if (allowSwitch) {
      this.startMonitoringBuffer();
    }

    const liveLatency = deltaTimeMs + (request.timeToFirstByte || 0);
    const segmentDelay =
      Date.now() - request.requestStartTime + (request.timeToFirstByte || 0);
    const segmentData = {
      contentType: request.contentType,
      timestamp: Date.now(),
      latency: liveLatency,
      delay: segmentDelay,
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
      const stats = new DisplayStats(this.getLatencyStatistics());
      stats.displayToContainer();
    }, 1000);
  }

  calculateJitter() {
    const delays = this.downloadedSegments.map((segment) => segment.delay);

    if (delays.length < 2) {
      return 0;
    }

    const meanDelay =
      delays.reduce((sum, delay) => sum + delay, 0) / delays.length;
    const sumSquaredDifferences = delays.reduce(
      (sum, delay) => sum + Math.pow(delay - meanDelay, 2),
      0
    );
    const jitter = Math.sqrt(sumSquaredDifferences / (delays.length - 1));

    return Math.round(jitter) / 1000;
  }

  setupErrorHandling() {
    this.player
      .getNetworkingEngine()
      .registerResponseFilter((type, response) => {
        if (response.status >= 400) {
          const failedSegment = {
            uri: response.uri,
            timestamp: Date.now(),
            status: response.status,
          };
          this.failedSegments.push(failedSegment);
          console.error(
            `Failed to download segment: ${response.uri}, Status: ${response.status}`
          );
        }
      });
  }

  getFailedSegments() {
    return this.failedSegments;
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
class DisplayStats {
  constructor(liveLatency) {
    this.displayedFrames = 0;
    this.droppedFrames = 0;
    this.totalFrames = 0;
    this.totalDroppedFrames = 0;
    this.decodedFrames = 0;
    this.totalDecodedFrames = 0;
    this.latency = 0;
    this.liveLatency = liveLatency;
    this.delaySegments = [];
    this.jitterSegments = [];
  }
  displayToContainer() {
    const liveLatency = document.getElementById("liveLatency");
    liveLatency.innerText = this.liveLatency.averageLatency.toFixed(2);
  }
}
