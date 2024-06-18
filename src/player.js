import shaka from "shaka-player";
import { BufferManager } from "./buffer";
const manifestUri = "http://localhost:3000/stream/video/aot/playlist.mpd";

function initApp() {
  // Install built-in polyfills to patch browser incompatibilities.
  shaka.polyfill.installAll();

  // Check to see if the browser supports the basic APIs Shaka needs.
  if (shaka.Player.isBrowserSupported()) {
    if (shaka.net.HttpFetchPlugin.isSupported()) {
      shaka.net.NetworkingEngine.registerScheme(
        "http",
        shaka.net.HttpFetchPlugin.parse,
        shaka.net.NetworkingEngine.PluginPriority.PREFERRED,
        /* progressSupport= */ true
      );
      initPlayer();
    }
    // Everything looks good!
  } else {
    // This browser does not have the minimum set of APIs we need.
    console.error("Browser not supported!");
  }
}

async function initPlayer() {
  // Create a Player instance.
  const video = document.getElementById("video");
  const player = new shaka.Player();
  await player.attach(video);

  // Attach player to the window to make it easy to access in the JS console.
  window.player = player;

  // Listen for error events.
  player.addEventListener("error", onErrorEvent);

  player.configure(
    "abrFactory",
    () => new BufferManager(() => player?.getBufferFullness(), player)
  );
  video.onloadedmetadata = (e) => {
    const bufferingGoal = calculateDuration(video.duration);
    player.configure({
      streaming: {
        // lowLatencyMode: true,
        bufferingGoal,
      },
    });
  };

  video.ontimeupdate = () => {
    const stats = player.getStats();
    const network = player.getNetworkingEngine();
  };
  // Try to load a manifest.
  // This is an asynchronous process.
  try {
    await player.load(manifestUri);
    // This runs if the asynchronous load is successful.
    console.log("The video has now been loaded!");
  } catch (e) {
    // onError is executed if the asynchronous load fails.
    onError(e);
  }
}

function onErrorEvent(event) {
  // Extract the shaka.util.Error object from the event.
  onError(event.detail);
}
function calculateDuration(duration) {
  const bufferPercentage = 10;
  const bufferingGoal = (duration * bufferPercentage) / 100;
  return Math.round(bufferingGoal * 100) / 100; // Membulatkan ke dua desimal
}
function onError(error) {
  // Log the error.
  console.error("Error code", error.code, "object", error);
}

document.addEventListener("DOMContentLoaded", initApp);
