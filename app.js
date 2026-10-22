(() => {
  'use strict';

  const STORAGE_KEY = 'ledger.v1';
  const COLORS = ['#3b6fe0', '#e0773b', '#1a8f5a', '#c4459b', '#d6a520', '#2bb3c0', '#8a5cd6', '#d64545', '#6b8e23', '#7f8c8d'];

  const defaults = () => ({
    transactions: [],
    budget: 0,
    categories: {
      expense: ['식비', '카페/간식', '교통', '주거/통신', '생활용품', '쇼핑', '의료/건강', '문화/여가', '교육', '경조사', '기타'],
      income: ['월급', '용돈', '부수입', '이자', '기타'],
    },
    methods: ['카드', '현금', '계좌이체'],
  });

  // ---------- storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      return { ...defaults(), ...JSON.parse(raw) };
    } catch {
      return defaults();
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      alert('저장에 실패했습니다: ' + e.message);
    }
  }

  let state = load();
  let viewMonth = monthKey(new Date());
  let editingId = null;

  // ---------- helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const won = (n) => n.toLocaleString('ko-KR') + '원';
  const parseAmount = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function today() {
    const d = new Date();
    return monthKey(d) + '-' + String(d.getDate()).padStart(2, '0');
  }
  function shiftMonth(key, delta) {
    const [y, m] = key.split('-').map(Number);
    return monthKey(new Date(y, m - 1 + delta, 1));
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const monthTx = () => state.transactions.filter((t) => t.date.startsWith(viewMonth));
  const currentType = () => document.querySelector('input[name=type]:checked').value;

  // ---------- form ----------
  function fillSelect(sel, items, value) {
    sel.innerHTML = items.map((c) => `<option>${escapeHtml(c)}</option>`).join('');
    if (value && items.includes(value)) sel.value = value;
  }
  function refreshFormOptions(keepCategory) {
    fillSelect($('#fCategory'), state.categories[currentType()], keepCategory);
    fillSelect($('#fMethod'), state.methods, $('#fMethod').value);
  }
  function resetForm() {
    editingId = null;
    $('#txForm').reset();
    $('#fDate').value = today().startsWith(viewMonth) ? today() : viewMonth + '-01';
    $('#formTitle').textContent = '내역 추가';
    $('#submitBtn').textContent = '추가';
    $('#cancelEdit').hidden = true;
    refreshFormOptions();
  }
  function startEdit(id) {
    const t = state.transactions.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    document.querySelector(`input[name=type][value=${t.type}]`).checked = true;
    refreshFormOptions(t.category);
    $('#fDate').value = t.date;
    $('#fAmount').value = t.amount.toLocaleString('ko-KR');
    $('#fMethod').value = t.method;
    $('#fMemo').value = t.memo;
    $('#formTitle').textContent = '내역 수정';
    $('#submitBtn').textContent = '저장';
    $('#cancelEdit').hidden = false;
    $('#txForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('#txForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount($('#fAmount').value);
    if (!amount) { $('#fAmount').focus(); return; }
    const tx = {
      id: editingId || uid(),
      type: currentType(),
      date: $('#fDate').value,
      amount,
      category: $('#fCategory').value,
      method: $('#fMethod').value,
      memo: $('#fMemo').value.trim(),
    };
    if (editingId) {
      state.transactions = state.transactions.map((t) => (t.id === editingId ? tx : t));
    } else {
      state.transactions.push(tx);
    }
    save();
    viewMonth = tx.date.slice(0, 7);
    resetForm();
    render();
  });
  $('#cancelEdit').addEventListener('click', resetForm);
  document.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', () => refreshFormOptions()));
  $('#fAmount').addEventListener('input', (e) => {
    const n = parseAmount(e.target.value);
    e.target.value = n ? n.toLocaleString('ko-KR') : '';
  });

  // ---------- render ----------
  function renderSummary(list) {
    const income = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;
    $('#sumIncome').textContent = won(income);
    $('#sumExpense').textContent = won(expense);
    $('#sumBalance').textContent = won(balance);
    $('#sumBalance').className = 'value ' + (balance < 0 ? 'expense' : '');

    const bar = $('#budgetBar');
    if (state.budget > 0) {
      const pct = (expense / state.budget) * 100;
      const left = state.budget - expense;
      $('#budgetText').textContent = `${won(expense)} / ${won(state.budget)} · ${left >= 0 ? won(left) + ' 남음' : won(-left) + ' 초과'}`;
      bar.style.width = Math.min(pct, 100) + '%';
      bar.classList.toggle('over', pct > 100);
    } else {
      $('#budgetText').textContent = '설정에서 월 예산을 입력하세요';
      bar.style.width = '0';
    }
  }

  function renderChart(list) {
    const totals = {};
    list.filter((t) => t.type === 'expense').forEach((t) => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const sum = entries.reduce((s, [, v]) => s + v, 0);
    const svg = $('#donut');
    const ul = $('#catList');

    if (!sum) {
      svg.innerHTML = '<circle cx="60" cy="60" r="45" fill="none" stroke="var(--border)" stroke-width="18"/>';
      ul.innerHTML = '<li class="empty" style="display:block">이번 달 지출이 없습니다</li>';
      return;
    }
    const r = 45, c = 2 * Math.PI * r;
    let offset = 0;
    svg.innerHTML = entries.map(([, v], i) => {
      const len = (v / sum) * c;
      const seg = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="18"
        stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
      offset += len;
      return seg;
    }).join('');
    ul.innerHTML = entries.map(([k, v], i) => `
      <li><span class="dot" style="background:${COLORS[i % COLORS.length]}"></span>
      <span>${escapeHtml(k)}</span><span>${won(v)}</span><span class="pct">${((v / sum) * 100).toFixed(1)}%</span></li>`).join('');
  }

  function renderList(list) {
    const type = $('#filterType').value;
    const q = $('#filterText').value.trim().toLowerCase();
    const filtered = list
      .filter((t) => type === 'all' || t.type === type)
      .filter((t) => !q || [t.category, t.memo, t.method].some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    if (!filtered.length) {
      $('#txList').innerHTML = '<p class="empty">내역이 없습니다</p>';
      return;
    }
    const byDay = {};
    filtered.forEach((t) => (byDay[t.date] ||= []).push(t));
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

    $('#txList').innerHTML = Object.entries(byDay).map(([date, items]) => {
      const d = new Date(date + 'T00:00:00');
      const net = items.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
      return `<div class="day">
        <div class="day-head"><span>${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})</span>
          <span class="${net < 0 ? 'expense' : 'income'}">${net < 0 ? '-' : '+'}${won(Math.abs(net))}</span></div>
        ${items.map((t) => `<div class="tx">
          <div class="info"><div class="cat">${escapeHtml(t.category)}</div>
            <div class="memo">${escapeHtml(t.method)}${t.memo ? ' · ' + escapeHtml(t.memo) : ''}</div></div>
          <span class="amt ${t.type}">${t.type === 'income' ? '+' : '-'}${won(t.amount)}</span>
          <span class="btns"><button data-edit="${t.id}">수정</button><button data-del="${t.id}">삭제</button></span>
        </div>`).join('')}
      </div>`;
    }).join('');
  }

  function render() {
    const [y, m] = viewMonth.split('-');
    $('#monthLabel').textContent = `${y}년 ${Number(m)}월`;
    const list = monthTx();
    renderSummary(list);
    renderChart(list);
    renderList(list);
  }

  $('#txList').addEventListener('click', (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.del;
    if (editId) startEdit(editId);
    if (delId && confirm('이 내역을 삭제할까요?')) {
      state.transactions = state.transactions.filter((t) => t.id !== delId);
      if (editingId === delId) resetForm();
      save();
      render();
    }
  });
  $('#filterType').addEventListener('change', render);
  $('#filterText').addEventListener('input', render);
  $('#prevMonth').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, -1); if (!editingId) resetForm(); render(); });
  $('#nextMonth').addEventListener('click', () => { viewMonth = shiftMonth(viewMonth, 1); if (!editingId) resetForm(); render(); });

  // ---------- settings ----------
  const listTargets = {
    expense: { get: () => state.categories.expense, el: '#expenseCats', input: '#newExpenseCat' },
    income: { get: () => state.categories.income, el: '#incomeCats', input: '#newIncomeCat' },
    method: { get: () => state.methods, el: '#methods', input: '#newMethod' },
  };
  function renderChips() {
    Object.entries(listTargets).forEach(([key, t]) => {
      $(t.el).innerHTML = t.get().map((c, i) =>
        `<span class="chip">${escapeHtml(c)}<button type="button" data-remove="${key}" data-index="${i}" aria-label="삭제">×</button></span>`).join('');
    });
  }
  $('#openSettings').addEventListener('click', () => {
    $('#sBudget').value = state.budget ? state.budget.toLocaleString('ko-KR') : '';
    renderChips();
    $('#settings').showModal();
  });
  $('#sBudget').addEventListener('input', (e) => {
    const n = parseAmount(e.target.value);
    e.target.value = n ? n.toLocaleString('ko-KR') : '';
  });
  $('#settings').addEventListener('close', () => {
    state.budget = parseAmount($('#sBudget').value);
    save();
    refreshFormOptions($('#fCategory').value);
    render();
  });
  $('#settings').addEventListener('click', (e) => {
    const addKey = e.target.dataset.add;
    const removeKey = e.target.dataset.remove;
    if (addKey) {
      const t = listTargets[addKey];
      const val = $(t.input).value.trim();
      if (val && !t.get().includes(val)) t.get().push(val);
      $(t.input).value = '';
      save();
      renderChips();
    }
    if (removeKey) {
      const arr = listTargets[removeKey].get();
      if (arr.length <= 1) { alert('최소 1개는 있어야 합니다.'); return; }
      arr.splice(Number(e.target.dataset.index), 1);
      save();
      renderChips();
    }
  });
  Object.values(listTargets).forEach((t) => {
    $(t.input).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.nextElementSibling.click(); }
    });
  });

  $('#exportJson').addEventListener('click', () => {
    download(`가계부-백업-${today()}.json`, JSON.stringify(state, null, 2), 'application/json');
  });
  $('#importJsonBtn').addEventListener('click', () => $('#importJson').click());
  $('#importJson').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.transactions)) throw new Error('형식이 올바르지 않습니다');
      if (!confirm(`${data.transactions.length}건의 내역으로 현재 데이터를 덮어쓸까요?`)) return;
      state = { ...defaults(), ...data };
      save();
      $('#sBudget').value = state.budget ? state.budget.toLocaleString('ko-KR') : '';
      $('#settings').close();
      resetForm();
      render();
    } catch (err) {
      alert('복원 실패: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });
  $('#exportCsv').addEventListener('click', () => {
    const rows = [['날짜', '구분', '카테고리', '결제수단', '금액', '메모']];
    monthTx().sort((a, b) => a.date.localeCompare(b.date)).forEach((t) =>
      rows.push([t.date, t.type === 'income' ? '수입' : '지출', t.category, t.method, t.amount, t.memo]));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(`가계부-${viewMonth}.csv`, '﻿' + csv, 'text/csv');
  });
  $('#resetAll').addEventListener('click', () => {
    if (!confirm('모든 내역과 설정을 삭제합니다. 계속할까요?')) return;
    if (!confirm('정말 삭제할까요? 되돌릴 수 없습니다.')) return;
    state = defaults();
    save();
    $('#sBudget').value = '';
    $('#settings').close();
    resetForm();
    render();
  });

  resetForm();
  render();
})();
