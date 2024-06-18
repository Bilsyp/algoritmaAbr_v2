export class StreamingChart {
  constructor(canvasId, options) {
    this.canvasId = canvasId;
    this.options = options;
    this.chart = null;
    this.data = {
      labels: [],
      datasets: [
        {
          label: "Streaming Data",
          data: [],
          borderColor: "blue",
          backgroundColor: "red",
        },
      ],
    };
  }

  init() {
    const ctx = document.getElementById(this.canvasId).getContext("2d");
    this.chart = new Chart(ctx, {
      type: "line",
      data: this.data,
      options: this.options,
    });
  }

  updateData(newData) {
    this.data.labels.push(new Date().toLocaleTimeString());
    this.data.datasets[0].data.push(newData);
    this.chart.update();
  }

  startStreaming() {
    setInterval(() => {
      const newData = Math.random() * 100;
      this.updateData(newData);
    }, 1000);
  }
}
