const form = document.querySelector('#task-form');
const titleInput = document.querySelector('#title');
const descriptionInput = document.querySelector('#description');
const priorityInput = document.querySelector('#priority');
const dueDateInput = document.querySelector('#due-date');
const submitButton = document.querySelector('#submit-button');
const cancelEditButton = document.querySelector('#cancel-edit');
const formHeading = document.querySelector('#form-heading');
const formMessage = document.querySelector('#form-message');
const listMessage = document.querySelector('#list-message');
const taskList = document.querySelector('#task-list');
const statusFilter = document.querySelector('#status-filter');
const taskSummary = document.querySelector('#task-summary');

let editingTaskId = null;
let allTasks = [];

function showMessage(element, message, type = '') {
  element.textContent = message;
  element.className = `message ${type}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatStatus(status) {
  return {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed'
  }[status] || status;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value).slice(0, 10)
    : date.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      });
}

function updateStatistics() {
  document.querySelector('#total-count').textContent = allTasks.length;
  document.querySelector('#pending-count').textContent =
    allTasks.filter(task => task.status === 'pending').length;
  document.querySelector('#progress-count').textContent =
    allTasks.filter(task => task.status === 'in_progress').length;
  document.querySelector('#completed-count').textContent =
    allTasks.filter(task => task.status === 'completed').length;
}

function renderTasks() {
  taskList.replaceChildren();

  const filter = statusFilter.value;
  const tasks = filter === 'all'
    ? allTasks
    : allTasks.filter(task => task.status === filter);

  taskSummary.textContent =
    `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} shown`;

  if (!tasks.length) {
    const empty = createElement('div', 'empty-state');
    empty.append(createElement('div', 'empty-symbol', '✦'));
    empty.append(createElement('strong', '', filter === 'all'
      ? 'Your workspace is clear'
      : `No ${formatStatus(filter).toLowerCase()} tasks`));
    empty.append(createElement('span', '', filter === 'all'
      ? 'Create your first task using the form to get started.'
      : 'Choose another filter or add a new task.'));
    taskList.append(empty);
    return;
  }

  for (const task of tasks) {
    const card = createElement(
      'article',
      `task-card${task.status === 'completed' ? ' is-completed' : ''}`
    );

    const titleRow = createElement('div', 'task-title-row');
    const checkButton = createElement(
      'button',
      'task-check',
      task.status === 'completed' ? '✓' : ''
    );
    checkButton.type = 'button';
    checkButton.setAttribute(
      'aria-label',
      task.status === 'completed' ? 'Reopen task' : 'Mark task completed'
    );
    checkButton.addEventListener('click', () => toggleTask(task));

    const main = createElement('div', 'task-main');
    main.append(createElement('div', 'task-title', task.title));

    if (task.description) {
      main.append(createElement('p', 'task-description', task.description));
    }

    titleRow.append(checkButton, main);
    card.append(titleRow);

    const badges = createElement('div', 'task-badges');
    badges.append(createElement(
      'span', `badge priority-${task.priority}`,
      `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`
    ));
    badges.append(createElement(
      'span', `badge status-${task.status}`, formatStatus(task.status)
    ));

    if (task.due_date) {
      badges.append(createElement('span', 'badge due-date', `Due ${formatDate(task.due_date)}`));
    }

    card.append(badges);

    const actions = createElement('div', 'task-actions');
    const editButton = createElement('button', 'small-button', 'Edit');
    editButton.type = 'button';
    editButton.addEventListener('click', () => beginEdit(task));

    const statusButton = createElement(
      'button', 'small-button',
      task.status === 'completed' ? 'Reopen' : 'Set status'
    );
    statusButton.type = 'button';
    statusButton.addEventListener('click', () => chooseStatus(task));

    const deleteButton = createElement('button', 'small-button delete', 'Delete');
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => deleteTask(task));

    actions.append(editButton, statusButton, deleteButton);
    card.append(actions);
    taskList.append(card);
  }
}

async function loadTasks() {
  taskList.replaceChildren(createElement('div', 'loading-state', 'Loading your tasks...'));
  showMessage(listMessage, '');

  try {
    allTasks = await api('/api/tasks');
    updateStatistics();
    renderTasks();
  } catch (error) {
    taskList.replaceChildren(
      createElement('div', 'empty-state', 'Could not load tasks. Check the database connection and try again.')
    );
    taskSummary.textContent = 'Tasks unavailable';
    showMessage(listMessage, error.message, 'error');
  }
}

function resetForm() {
  editingTaskId = null;
  form.reset();
  priorityInput.value = 'medium';
  formHeading.textContent = 'Create a task';
  submitButton.textContent = '＋ Add task';
  cancelEditButton.classList.add('hidden');
  showMessage(formMessage, '');
}

function beginEdit(task) {
  editingTaskId = task.id;
  titleInput.value = task.title;
  descriptionInput.value = task.description || '';
  priorityInput.value = task.priority;
  dueDateInput.value = task.due_date ? String(task.due_date).slice(0, 10) : '';
  formHeading.textContent = 'Edit task';
  submitButton.textContent = 'Save changes';
  cancelEditButton.classList.remove('hidden');
  showMessage(formMessage, 'Editing the selected task.', 'success');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  titleInput.focus();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    title: titleInput.value.trim(),
    description: descriptionInput.value.trim(),
    priority: priorityInput.value,
    due_date: dueDateInput.value || null
  };

  submitButton.disabled = true;
  showMessage(formMessage, editingTaskId ? 'Saving changes...' : 'Creating task...');

  try {
    if (editingTaskId !== null) {
      await api(`/api/tasks/${editingTaskId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      showMessage(formMessage, 'Task updated successfully.', 'success');
    } else {
      await api('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showMessage(formMessage, 'Task created successfully.', 'success');
    }

    resetForm();
    await loadTasks();
  } catch (error) {
    showMessage(formMessage, error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

async function toggleTask(task) {
  const status = task.status === 'completed' ? 'pending' : 'completed';

  try {
    await api(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await loadTasks();
  } catch (error) {
    showMessage(listMessage, error.message, 'error');
  }
}

async function chooseStatus(task) {
  const options = [
    ['pending', 'Pending'],
    ['in_progress', 'In progress'],
    ['completed', 'Completed']
  ];
  const currentIndex = options.findIndex(option => option[0] === task.status);
  const choices = options
    .filter(option => option[0] !== task.status)
    .map((option, index) => `${index + 1}. ${option[1]}`)
    .join('\n');

  const answer = window.prompt(
    `Change status for "${task.title}" to:\n${choices}\n\nEnter the option number, or Cancel.`,
    '1'
  );

  if (answer === null) return;

  const available = options.filter(option => option[0] !== task.status);
  const selected = available[Number(answer) - 1];

  if (!selected || Number(answer) < 1 || Number(answer) > available.length) {
    showMessage(listMessage, 'No status changed. Please choose a valid option number.', 'error');
    return;
  }

  if (selected[0] === options[currentIndex][0]) return;

  try {
    await api(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: selected[0] })
    });
    await loadTasks();
  } catch (error) {
    showMessage(listMessage, error.message, 'error');
  }
}

async function deleteTask(task) {
  if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;

  try {
    await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
    if (String(editingTaskId) === String(task.id)) resetForm();
    showMessage(listMessage, 'Task deleted.', 'success');
    await loadTasks();
  } catch (error) {
    showMessage(listMessage, error.message, 'error');
  }
}

cancelEditButton.addEventListener('click', resetForm);
statusFilter.addEventListener('change', renderTasks);
document.querySelector('#refresh-button').addEventListener('click', loadTasks);

async function initialize() {
  try {
    const health = await api('/api/health');
    document.querySelector('#environment-label').textContent =
      `${health.environment} · ${health.status}`;
    document.querySelector('.status-dot').style.background = '#4ade80';
    document.querySelector('#server-label').textContent =
      `Server: ${health.server}`;
  } catch {
    document.querySelector('#environment-label').textContent = 'Status unavailable';
  }

  await loadTasks();
}

initialize();
