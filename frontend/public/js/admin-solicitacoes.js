document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = ['127.0.0.1', 'localhost'].includes(window.location.hostname) && window.location.port !== '3000'
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : '';

  const summaryPending = document.getElementById('summary-pending');
  const summaryApproved = document.getElementById('summary-approved');
  const summaryRejected = document.getElementById('summary-rejected');
  const summaryDisabled = document.getElementById('summary-disabled');
  const filterInput = document.getElementById('filter-input');
  const btnRefresh = document.getElementById('btn-refresh');
  const feedback = document.getElementById('feedback');
  const loadingState = document.getElementById('loading-state');
  const contentSections = document.getElementById('content-sections');
  const pendingEmpty = document.getElementById('pending-empty');
  const pendingTableWrapper = document.getElementById('pending-table-wrapper');
  const pendingRequestList = document.getElementById('pending-request-list');
  const activeEmpty = document.getElementById('active-empty');
  const activeTableWrapper = document.getElementById('active-table-wrapper');
  const activeUserList = document.getElementById('active-user-list');

  let pendingRequests = [];
  let activeUsers = [];
  let filterTerm = '';

  function formatDate(value) {
    if (!value) return '-';

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = `mb-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
      type === 'error'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-emerald-50 text-emerald-700'
    }`;
    feedback.classList.remove('hidden');
  }

  function hideFeedback() {
    feedback.classList.add('hidden');
    feedback.textContent = '';
  }

  function setLoading(loading) {
    loadingState.classList.toggle('hidden', !loading);
    contentSections.classList.toggle('opacity-60', loading);
    btnRefresh.disabled = loading;
    btnRefresh.classList.toggle('opacity-70', loading);
    btnRefresh.classList.toggle('cursor-not-allowed', loading);
  }

  function matchesFilter(record) {
    const normalized = filterTerm.trim().toLowerCase();
    if (!normalized) return true;

    const haystack = [
      record.nome,
      record.email,
      record.oab,
      record.usuario,
      record.cpf,
      record.perfil,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalized);
  }

  function getProfileBadge(perfil) {
    if (perfil === 'advogado') {
      return '<span class="status-badge bg-rose-100 text-rose-700"><i class="fa-solid fa-scale-balanced"></i>Advogado</span>';
    }

    return '<span class="status-badge bg-sky-100 text-sky-700"><i class="fa-solid fa-users"></i>Colaborador</span>';
  }

  function getDocumentLabel(record) {
    return record.oab ? `OAB ${record.oab}` : record.cpf || '-';
  }

  function renderPendingRequests() {
    const filtered = pendingRequests.filter(matchesFilter);
    pendingRequestList.innerHTML = '';

    pendingTableWrapper.classList.toggle('hidden', filtered.length === 0);
    pendingEmpty.classList.toggle('hidden', filtered.length > 0);

    if (filtered.length === 0) {
      const title = pendingRequests.length === 0
        ? 'Nenhuma solicitacao pendente'
        : 'Nenhum resultado encontrado';
      const description = pendingRequests.length === 0
        ? 'Quando novos cadastros chegarem, eles aparecerao aqui.'
        : 'Ajuste o termo de busca para localizar a solicitacao desejada.';

      pendingEmpty.querySelector('h4').textContent = title;
      pendingEmpty.querySelector('p').textContent = description;
      return;
    }

    filtered.forEach((request) => {
      const item = document.createElement('article');
      item.className = 'grid gap-4 px-5 py-5 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr_auto] lg:items-start';

      item.innerHTML = `
        <div class="lg:min-h-[56px]">
          <p class="text-base font-extrabold text-nit-ink">${request.nome}</p>
          <p class="mt-1 text-sm text-slate-500">${request.email}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:items-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Perfil</p>
          <div class="mt-1 lg:mt-0">${getProfileBadge(request.perfil)}</div>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Documento</p>
          <p class="mt-1 text-sm font-semibold text-slate-700">${getDocumentLabel(request)}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Usuario</p>
          <p class="mt-1 text-sm font-semibold text-slate-700">${request.usuario || request.email}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Enviado em</p>
          <p class="mt-1 text-sm text-slate-600">${formatDate(request.criadoEm)}</p>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row lg:min-h-[56px] lg:items-start lg:justify-end">
          <button
            type="button"
            class="btn-approve rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
            data-id="${request.id}"
          >
            <i class="fa-solid fa-check mr-2"></i>
            Aprovar
          </button>
          <button
            type="button"
            class="btn-reject rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
            data-id="${request.id}"
          >
            <i class="fa-solid fa-xmark mr-2"></i>
            Recusar
          </button>
        </div>
      `;

      pendingRequestList.appendChild(item);
    });
  }

  function renderActiveUsers() {
    const filtered = activeUsers.filter(matchesFilter);
    activeUserList.innerHTML = '';

    activeTableWrapper.classList.toggle('hidden', filtered.length === 0);
    activeEmpty.classList.toggle('hidden', filtered.length > 0);

    if (filtered.length === 0) {
      const title = activeUsers.length === 0
        ? 'Nenhum usuario ativo encontrado'
        : 'Nenhum usuario ativo encontrado para a busca';
      const description = activeUsers.length === 0
        ? 'Usuarios aprovados aparecerao aqui para eventual desativacao.'
        : 'Ajuste o termo de busca para localizar o cadastro desejado.';

      activeEmpty.querySelector('h4').textContent = title;
      activeEmpty.querySelector('p').textContent = description;
      return;
    }

    filtered.forEach((user) => {
      const item = document.createElement('article');
      item.className = 'grid gap-4 px-5 py-5 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr_auto] lg:items-start';

      item.innerHTML = `
        <div class="lg:min-h-[56px]">
          <p class="text-base font-extrabold text-nit-ink">${user.nome}</p>
          <p class="mt-1 text-sm text-slate-500">${user.email}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:items-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Perfil</p>
          <div class="mt-1 lg:mt-0">${getProfileBadge(user.perfil)}</div>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Documento</p>
          <p class="mt-1 text-sm font-semibold text-slate-700">${getDocumentLabel(user)}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Login</p>
          <p class="mt-1 text-sm font-semibold text-slate-700">${user.usuario || user.email}</p>
        </div>

        <div class="lg:min-h-[56px] lg:flex lg:flex-col lg:justify-start">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 lg:hidden">Atualizado em</p>
          <p class="mt-1 text-sm text-slate-600">${formatDate(user.atualizadoEm)}</p>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row lg:min-h-[56px] lg:items-start lg:justify-end">
          <button
            type="button"
            class="btn-deactivate rounded-2xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:border-slate-400 hover:bg-slate-200"
            data-id="${user.id}"
          >
            <i class="fa-solid fa-user-slash mr-2"></i>
            Desativar
          </button>
        </div>
      `;

      activeUserList.appendChild(item);
    });
  }

  function renderAll() {
    renderPendingRequests();
    renderActiveUsers();
  }

  async function fetchDashboard() {
    setLoading(true);
    hideFeedback();

    try {
      const response = await fetch(`${API_BASE}/api/admin/access-requests`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel carregar o painel.');
      }

      pendingRequests = data.solicitacoes || [];
      activeUsers = data.usuariosAtivos || [];
      summaryPending.textContent = data.resumo?.pendentes ?? 0;
      summaryApproved.textContent = data.resumo?.ativos ?? 0;
      summaryRejected.textContent = data.resumo?.recusados ?? 0;
      summaryDisabled.textContent = data.resumo?.desativados ?? 0;
      renderAll();
    } catch (error) {
      pendingRequests = [];
      activeUsers = [];
      renderAll();
      showFeedback(error.message || 'Erro ao carregar o painel administrativo.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function reviewRequest(id, action) {
    hideFeedback();

    try {
      const response = await fetch(`${API_BASE}/api/admin/access-requests/${id}/${action}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel atualizar a solicitacao.');
      }

      pendingRequests = pendingRequests.filter((request) => request.id !== id);
      summaryPending.textContent = Math.max(0, Number(summaryPending.textContent) - 1);

      if (action === 'approve') {
        summaryApproved.textContent = Number(summaryApproved.textContent) + 1;
        if (data.solicitacao) {
          activeUsers = [data.solicitacao, ...activeUsers];
        }
      } else {
        summaryRejected.textContent = Number(summaryRejected.textContent) + 1;
      }

      renderAll();
      showFeedback(data.message || 'Solicitacao atualizada com sucesso.', 'success');
    } catch (error) {
      showFeedback(error.message || 'Erro ao atualizar a solicitacao.', 'error');
    }
  }

  async function deactivateUser(id) {
    hideFeedback();

    try {
      const response = await fetch(`${API_BASE}/api/admin/access-requests/${id}/deactivate`, {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Nao foi possivel desativar o cadastro.');
      }

      activeUsers = activeUsers.filter((user) => user.id !== id);
      summaryApproved.textContent = Math.max(0, Number(summaryApproved.textContent) - 1);
      summaryDisabled.textContent = Number(summaryDisabled.textContent) + 1;

      renderAll();
      showFeedback(data.message || 'Cadastro desativado com sucesso.', 'success');
    } catch (error) {
      showFeedback(error.message || 'Erro ao desativar o cadastro.', 'error');
    }
  }

  filterInput.addEventListener('input', (event) => {
    filterTerm = event.target.value;
    renderAll();
  });

  btnRefresh.addEventListener('click', fetchDashboard);

  pendingRequestList.addEventListener('click', (event) => {
    const approveButton = event.target.closest('.btn-approve');
    const rejectButton = event.target.closest('.btn-reject');

    if (approveButton) {
      reviewRequest(Number.parseInt(approveButton.dataset.id, 10), 'approve');
      return;
    }

    if (rejectButton) {
      reviewRequest(Number.parseInt(rejectButton.dataset.id, 10), 'reject');
    }
  });

  activeUserList.addEventListener('click', (event) => {
    const deactivateButton = event.target.closest('.btn-deactivate');

    if (deactivateButton) {
      deactivateUser(Number.parseInt(deactivateButton.dataset.id, 10));
    }
  });

  fetchDashboard();
});
