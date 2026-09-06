(function () {
  const COLORS = {
    axis: '#526174',
    grid: '#e4e9ef',
    bar: '#245b92',
    initial: '#17653f',
    update: '#b88720',
    text: '#202c3d'
  };

  const PADDING = { top: 24, right: 24, bottom: 48, left: 56 };

  async function loadData() {
    const url = window.__ANALYTICS_DATA_URL__;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error('Failed to load analytics data (' + response.status + ')');
    }
    return response.json();
  }

  function formatHour(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function drawChart(canvas, timeline, publicationHistory) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const plotLeft = PADDING.left;
    const plotRight = width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = height - PADDING.bottom;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    const times = timeline.map(point => new Date(point.bucketStart).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeSpan = Math.max(maxTime - minTime, 1);

    const maxViews = Math.max(...timeline.map(point => point.viewCount), 1);

    function xForTime(time) {
      return plotLeft + ((time - minTime) / timeSpan) * plotWidth;
    }

    function yForViews(views) {
      return plotBottom - (views / maxViews) * plotHeight;
    }

    // Axes
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridLines = 4;
    ctx.fillStyle = COLORS.text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= gridLines; i += 1) {
      const value = Math.round((maxViews / gridLines) * i);
      const y = yForViews(value);
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
      ctx.fillText(String(value), plotLeft - 8, y);
    }

    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    // X-axis labels: first, middle, last bucket
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelIndexes = [0, Math.floor((timeline.length - 1) / 2), timeline.length - 1];
    const seenLabels = new Set();
    labelIndexes.forEach(index => {
      if (index < 0 || seenLabels.has(index)) return;
      seenLabels.add(index);
      const point = timeline[index];
      const x = xForTime(new Date(point.bucketStart).getTime());
      ctx.fillText(formatHour(point.bucketStart), x, plotBottom + 8);
    });

    // View bars
    const barWidth = Math.max(plotWidth / timeline.length - 2, 2);
    ctx.fillStyle = COLORS.bar;
    timeline.forEach(point => {
      const x = xForTime(new Date(point.bucketStart).getTime());
      const y = yForViews(point.viewCount);
      ctx.fillRect(x - barWidth / 2, y, barWidth, plotBottom - y);
    });

    // Publication events: distinct vertical markers per type
    publicationHistory.forEach(event => {
      const eventTime = new Date(event.approvedAt).getTime();
      const clampedTime = Math.min(Math.max(eventTime, minTime), maxTime);
      const x = xForTime(clampedTime);
      ctx.strokeStyle = event.type === 'initial' ? COLORS.initial : COLORS.update;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, plotTop);
      ctx.lineTo(x, plotBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = event.type === 'initial' ? COLORS.initial : COLORS.update;
      ctx.beginPath();
      ctx.arc(x, plotTop, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function renderTotals(totalViews) {
    const el = document.getElementById('total-views');
    if (el) el.textContent = totalViews.toLocaleString('en-GB');
  }

  async function init() {
    const canvas = document.getElementById('analytics-chart');
    const emptyState = document.getElementById('chart-empty');
    const wrapper = document.getElementById('chart-wrapper');
    if (!canvas) return;

    try {
      const data = await loadData();
      renderTotals(data.totalViews || 0);

      if (!data.timeline || !data.timeline.length) {
        if (emptyState) emptyState.hidden = false;
        if (wrapper) wrapper.hidden = true;
        return;
      }

      if (emptyState) emptyState.hidden = true;
      if (wrapper) wrapper.hidden = false;
      drawChart(canvas, data.timeline, data.publicationHistory || []);
    } catch (error) {
      if (emptyState) {
        emptyState.hidden = false;
        emptyState.querySelector('p').textContent = 'Analytics data could not be loaded. Please try again later.';
      }
      if (wrapper) wrapper.hidden = true;
      console.error(error);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
