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

    const times = timeline.map(point => new Date(point.bucketStart).getTime())
      .concat(publicationHistory.map(event => new Date(event.approvedAt).getTime()));
    const minTime = times.reduce((min, time) => Math.min(min, time), Infinity);
    const maxTime = times.reduce((max, time) => Math.max(max, time), -Infinity);
    const timeSpan = Math.max(maxTime - minTime, 60 * 60 * 1000);

    const maxViews = timeline.reduce((max, point) => Math.max(max, point.viewCount), 1);

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

    // Axis titles, so the chart is legible without relying only on the legend.
    ctx.save();
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.translate(14, (plotTop + plotBottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Views per interval', 0, 0);
    ctx.restore();

    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Time', (plotLeft + plotRight) / 2, height - 16);

    // X-axis labels: first, middle, last bucket
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labels = width < 500 ? [minTime, minTime + timeSpan] : [minTime, minTime + timeSpan / 2, minTime + timeSpan];
    labels.forEach((time, index) => {
      ctx.textAlign = index === 0 ? 'left' : index === labels.length - 1 ? 'right' : 'center';
      ctx.fillText(formatHour(time), xForTime(time), plotBottom + 8);
    });

    // View bars
    const barWidth = Math.max(1, Math.min(plotWidth / timeline.length - 2, plotWidth * 3600000 / timeSpan * 0.8));
    ctx.fillStyle = COLORS.bar;
    timeline.forEach(point => {
      const x = xForTime(new Date(point.bucketStart).getTime());
      const y = yForViews(point.viewCount);
      ctx.fillRect(x - barWidth / 2, y, barWidth, plotBottom - y);
    });

    // Publication events: distinct vertical markers per type
    publicationHistory.forEach(event => {
      const eventTime = new Date(event.approvedAt).getTime();
      const x = xForTime(eventTime);
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

  function renderComparisons(timeline, history) {
    const list = document.getElementById('update-comparisons');
    list.replaceChildren();
    history.forEach(event => {
      const item = document.createElement('li');
      const date = new Date(event.approvedAt);
      item.textContent = `${event.type === 'initial' ? 'Initial publication' : 'Update approved'}: ${date.toLocaleString('en-GB')}`;
      if (event.type === 'update') {
        const time = date.getTime();
        const day = 24 * 60 * 60 * 1000;
        const before = timeline.filter(point => { const at = new Date(point.bucketStart).getTime(); return at >= time - day && at < time; });
        const after = timeline.filter(point => { const at = new Date(point.bucketStart).getTime(); return at >= time && at < time + day; });
        const total = points => points.reduce((sum, point) => sum + point.viewCount, 0);
        item.textContent += ` — previous 24h: ${total(before)} views; following 24h: ${total(after)} views`;
        if (Date.now() < time + day) item.textContent += ' (following window still in progress)';
      }
      list.appendChild(item);
    });
    if (!history.length) list.textContent = 'No publication approvals yet.';
  }

  async function init() {
    const canvas = document.getElementById('analytics-chart');
    const emptyState = document.getElementById('chart-empty');
    const wrapper = document.getElementById('chart-wrapper');
    if (!canvas) return;

    try {
      const data = await loadData();
      renderTotals(data.totalViews || 0);
      renderComparisons(data.timeline || [], data.publicationHistory || []);

      if (!data.timeline || !data.timeline.length) {
        if (emptyState) emptyState.hidden = false;
        if (wrapper) wrapper.hidden = true;
        return;
      }

      if (emptyState) emptyState.hidden = true;
      if (wrapper) wrapper.hidden = false;
      const redraw = () => {
        // Match drawing coordinates to the displayed width so mobile labels
        // stay readable rather than shrinking a 960px bitmap to phone width.
        canvas.width = Math.max(250, Math.floor(canvas.clientWidth));
        canvas.height = 360;
        drawChart(canvas, data.timeline, data.publicationHistory || []);
      };
      redraw();
      window.addEventListener('resize', redraw);
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
