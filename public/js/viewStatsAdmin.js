(function () {
  const STATS_URL = window.__ANALYTICS_STATS_URL__;
  const PAGE_SIZE = 50;

  const rows = document.getElementById('stats-rows');
  const createForm = document.getElementById('stats-create');
  const message = document.getElementById('stats-message');
  const previousButton = document.getElementById('stats-prev');
  const nextButton = document.getElementById('stats-next');
  const pageLabel = document.getElementById('stats-page');
  if (!STATS_URL || !rows || !createForm) return;

  let page = 1;

  function showMessage(text, state) {
    message.textContent = text;
    if (state) message.dataset.state = state;
    else delete message.dataset.state;
  }

  async function request(url, method = 'GET', body) {
    const response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'The statistics request failed.');
    return result;
  }

  // Tell the chart above to reload after every saved change.
  function statisticsChanged(text) {
    showMessage(text, 'success');
    window.dispatchEvent(new Event('analytics:changed'));
    return loadPage();
  }

  function formatHour(value) {
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function renderRow(record) {
    const row = document.createElement('tr');
    const hour = document.createElement('th');
    hour.scope = 'row';
    const time = document.createElement('time');
    time.dateTime = record.bucketStart;
    time.textContent = formatHour(record.bucketStart);
    hour.appendChild(time);

    const countCell = document.createElement('td');
    const countLabel = document.createElement('label');
    countLabel.className = 'sr-only';
    countLabel.htmlFor = `count-${record._id}`;
    countLabel.textContent = `Views for ${time.textContent}`;
    const count = document.createElement('input');
    count.id = countLabel.htmlFor;
    count.className = 'stats-count';
    count.type = 'number';
    count.min = '0';
    count.max = '1000000000';
    count.step = '1';
    count.required = true;
    count.value = record.viewCount;
    countCell.append(countLabel, count);

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'stats-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Delete';
    actions.append(save, remove);
    actionsCell.appendChild(actions);

    save.addEventListener('click', async () => {
      const viewCount = Number(count.value);
      if (count.value === '' || !Number.isSafeInteger(viewCount) || viewCount < 0) {
        showMessage('Views must be a whole number of zero or more.', 'error');
        return;
      }
      save.disabled = true;
      try {
        await request(`${STATS_URL}/${record._id}`, 'PATCH', { viewCount });
        await statisticsChanged('Statistics updated.');
      } catch (error) {
        save.disabled = false;
        showMessage(error.message, 'error');
      }
    });

    remove.addEventListener('click', async () => {
      if (!window.confirm(`Delete the statistics for ${time.textContent}?`)) return;
      remove.disabled = true;
      try {
        await request(`${STATS_URL}/${record._id}`, 'DELETE');
        await statisticsChanged('Statistics deleted.');
      } catch (error) {
        remove.disabled = false;
        showMessage(error.message, 'error');
      }
    });

    row.append(hour, countCell, actionsCell);
    return row;
  }

  async function loadPage() {
    try {
      const { records } = await request(`${STATS_URL}?page=${page}`);
      if (!records.length && page > 1) {
        page -= 1;
        return loadPage();
      }
      rows.replaceChildren(...records.map(renderRow));
      if (!records.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 3;
        cell.textContent = 'No view statistics recorded yet.';
        row.appendChild(cell);
        rows.appendChild(row);
      }
      pageLabel.textContent = `Page ${page}`;
      previousButton.disabled = page === 1;
      nextButton.disabled = records.length < PAGE_SIZE;
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  createForm.addEventListener('submit', async event => {
    event.preventDefault();
    const hour = new Date(createForm.elements.bucketStart.value);
    const viewCount = Number(createForm.elements.viewCount.value);
    if (!Number.isFinite(hour.getTime()) || !Number.isSafeInteger(viewCount) || viewCount < 0) {
      showMessage('Choose an hour and a whole number of views.', 'error');
      return;
    }
    const button = createForm.querySelector('button');
    button.disabled = true;
    try {
      // The browser value is local time; send an exact instant to the server.
      await request(STATS_URL, 'POST', { bucketStart: hour.toISOString(), viewCount });
      createForm.reset();
      page = 1;
      await statisticsChanged('Statistics added.');
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  previousButton.addEventListener('click', () => { page -= 1; loadPage(); });
  nextButton.addEventListener('click', () => { page += 1; loadPage(); });

  loadPage();
})();
