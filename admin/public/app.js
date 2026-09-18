const flash = document.getElementById('flash');

function showFlash(text) {
  flash.hidden = false;
  flash.textContent = text;
  clearTimeout(showFlash._t);
  showFlash._t = setTimeout(() => {
    flash.hidden = true;
  }, 3200);
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

document.querySelectorAll('.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('is-active'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('is-active');
  });
});

let groups = [];
let reports = [];
let users = [];

function renderChecks(container, items, selected = [], valueKey = 'id', labelFn) {
  const selectedSet = new Set((selected || []).map(String));
  container.innerHTML = items
    .map((item) => {
      const value = String(item[valueKey]);
      const label = labelFn ? labelFn(item) : item.name || item.login || value;
      return `
      <label>
        <input type="checkbox" value="${value}" ${selectedSet.has(value) ? 'checked' : ''} />
        <span>${label}</span>
      </label>`;
    })
    .join('');
}

function selectedValues(container) {
  return [...container.querySelectorAll('input:checked')].map((el) => el.value);
}

function resetUserForm() {
  const form = document.getElementById('user-form');
  form.reset();
  form.id.value = '';
  document.getElementById('user-form-title').textContent = 'Новый пользователь';
  document.getElementById('user-form-submit').textContent = 'Создать пользователя';
  renderChecks(document.getElementById('user-groups'), groups);
}

function resetGroupForm() {
  const form = document.getElementById('group-form');
  form.reset();
  form.id.value = '';
  document.getElementById('group-form-title').textContent = 'Новая группа';
  document.getElementById('group-form-submit').textContent = 'Создать группу';
  renderChecks(
    document.getElementById('group-users'),
    users,
    [],
    'id',
    (u) => `${u.login}${u.fullname ? ` — ${u.fullname}` : ''}`,
  );
  renderChecks(document.getElementById('group-reports'), reports);
}

function fillUserForm(user) {
  const form = document.getElementById('user-form');
  form.id.value = user.id;
  form.login.value = user.login || '';
  form.fullname.value = user.fullname || '';
  form.firstname.value = user.firstname || '';
  form.role.value = user.role || 'user';
  document.getElementById('user-form-title').textContent = `Изменить: ${user.login}`;
  document.getElementById('user-form-submit').textContent = 'Сохранить изменения';
  renderChecks(document.getElementById('user-groups'), groups, user.group_ids || []);
}

function fillGroupForm(group) {
  const form = document.getElementById('group-form');
  form.id.value = group.id;
  form.name.value = group.name || '';
  form.description.value = group.description || '';
  document.getElementById('group-form-title').textContent = `Изменить: ${group.name}`;
  document.getElementById('group-form-submit').textContent = 'Сохранить изменения';
  renderChecks(
    document.getElementById('group-users'),
    users,
    group.user_ids || [],
    'id',
    (u) => `${u.login}${u.fullname ? ` — ${u.fullname}` : ''}`,
  );
  renderChecks(document.getElementById('group-reports'), reports, group.report_ids || []);
}

async function refresh({ keepUserForm = false, keepGroupForm = false } = {}) {
  const userId = keepUserForm ? document.getElementById('user-form').id.value : '';
  const groupId = keepGroupForm ? document.getElementById('group-form').id.value : '';

  const [g, r, u] = await Promise.all([
    api('/groups'),
    api('/reports'),
    api('/users'),
  ]);
  groups = g.items;
  reports = r.items;
  users = u.items;

  if (!keepUserForm) {
    renderChecks(document.getElementById('user-groups'), groups);
  } else if (userId) {
    const user = users.find((item) => item.id === userId);
    if (user) fillUserForm(user);
  }

  if (!keepGroupForm) {
    renderChecks(
      document.getElementById('group-users'),
      users,
      [],
      'id',
      (item) => `${item.login}${item.fullname ? ` — ${item.fullname}` : ''}`,
    );
    renderChecks(document.getElementById('group-reports'), reports);
  } else if (groupId) {
    const group = groups.find((item) => item.id === groupId);
    if (group) fillGroupForm(group);
  }

  document.getElementById('users-list').innerHTML = users
    .map(
      (user) => `
      <div class="list-item">
        <div>
          <strong>${user.login}</strong>
          <div>${user.fullname || ''} ${user.firstname || ''}</div>
          <div class="muted">role: ${user.role}</div>
        </div>
        <div class="list-actions">
          <button type="button" data-edit-user="${user.id}">Изменить</button>
          <button type="button" class="danger" data-del-user="${user.id}">Удалить</button>
        </div>
      </div>`,
    )
    .join('');

  document.getElementById('groups-list').innerHTML = groups
    .map(
      (group) => `
      <div class="list-item">
        <div>
          <strong>${group.name}</strong>
          <div>${group.description || ''}</div>
          <div class="muted">пользователей: ${group.users_count || 0}</div>
        </div>
        <div class="list-actions">
          <button type="button" data-edit-group="${group.id}">Изменить</button>
          <button type="button" class="danger" data-del-group="${group.id}">Удалить</button>
        </div>
      </div>`,
    )
    .join('');

  document.getElementById('reports-list').innerHTML = reports
    .map((report) => {
      const urls = report.imageUrls?.length
        ? report.imageUrls
        : report.imageUrl
          ? [report.imageUrl]
          : [];
      return `
      <div class="list-item">
        <div style="display:flex;gap:.75rem;align-items:flex-start;flex:1">
          <div class="thumbs">
            ${urls.map((url) => `<img src="${url}" alt="" />`).join('')}
          </div>
          <div>
            <strong>${report.name}</strong>
            <div class="muted">${report.code || ''}</div>
            <div>${report.description || ''}</div>
            <div class="muted">Источник: ${report.dataSource || '—'}</div>
            <div class="muted">Страницы: ${(report.pages || []).join(', ') || '—'}</div>
            <div class="muted">Картинок: ${urls.length}</div>
          </div>
        </div>
        <button type="button" class="danger" data-del-report="${report.id}">Удалить</button>
      </div>`;
    })
    .join('');
}

document.getElementById('user-form-reset').addEventListener('click', () => {
  resetUserForm();
});

document.getElementById('group-form-reset').addEventListener('click', () => {
  resetGroupForm();
});

document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get('id');
  const payload = {
    login: fd.get('login'),
    fullname: fd.get('fullname'),
    firstname: fd.get('firstname'),
    role: fd.get('role'),
    groupIds: selectedValues(document.getElementById('user-groups')),
  };
  try {
    if (id) {
      await api(`/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showFlash('Пользователь обновлён');
    } else {
      await api('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showFlash('Пользователь создан');
    }
    resetUserForm();
    await refresh();
  } catch (err) {
    showFlash(err.message);
  }
});

document.getElementById('group-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = (fd.get('id') || '').trim();
  const payload = {
    name: fd.get('name'),
    description: fd.get('description'),
    reportIds: selectedValues(document.getElementById('group-reports')),
    userIds: selectedValues(document.getElementById('group-users')),
  };
  try {
    if (id) {
      await api(`/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showFlash('Группа обновлена');
    } else {
      await api('/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showFlash('Группа создана');
    }
    resetGroupForm();
    await refresh();
  } catch (err) {
    showFlash(err.message);
  }
});

document.getElementById('report-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/reports', { method: 'POST', body: fd });
    e.target.reset();
    showFlash('Отчёт создан');
    await refresh();
  } catch (err) {
    showFlash(err.message);
  }
});

document.body.addEventListener('click', async (e) => {
  const delUser = e.target.closest('[data-del-user]');
  const delGroup = e.target.closest('[data-del-group]');
  const delReport = e.target.closest('[data-del-report]');
  const editUser = e.target.closest('[data-edit-user]');
  const editGroup = e.target.closest('[data-edit-group]');

  try {
    if (delUser) {
      await api(`/users/${delUser.dataset.delUser}`, { method: 'DELETE' });
      showFlash('Пользователь удалён');
      resetUserForm();
      await refresh();
    }
    if (delGroup) {
      await api(`/groups/${delGroup.dataset.delGroup}`, { method: 'DELETE' });
      showFlash('Группа удалена');
      resetGroupForm();
      await refresh();
    }
    if (delReport) {
      await api(`/reports/${delReport.dataset.delReport}`, { method: 'DELETE' });
      showFlash('Отчёт удалён');
      await refresh();
    }
    if (editUser) {
      const user = users.find((item) => item.id === editUser.dataset.editUser);
      if (!user) return;
      fillUserForm(user);
      document.querySelector('[data-tab=users]').click();
    }
    if (editGroup) {
      const group = groups.find((item) => item.id === editGroup.dataset.editGroup);
      if (!group) return;
      fillGroupForm(group);
      document.querySelector('[data-tab=groups]').click();
    }
  } catch (err) {
    showFlash(err.message);
  }
});

refresh().catch((err) => showFlash(err.message));
