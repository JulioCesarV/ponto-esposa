// ============================================================
//  CONFIGURAÇÃO E ESTADO
// ============================================================
const CONFIG_KEY = 'ponto_config_v3';
const REG_KEY    = 'ponto_registros_v3';

const CONFIG_PADRAO = {
  entradaPrevista:     "08:00",
  saidaAlmocoPrevista: "12:00",
  voltaAlmocoPrevista: "14:00",
  saidaPrevista:       "17:30"
};

let config    = JSON.parse(localStorage.getItem(CONFIG_KEY)) || CONFIG_PADRAO;
let registros = JSON.parse(localStorage.getItem(REG_KEY))    || [];

// ============================================================
//  UTILITÁRIOS
// ============================================================
const salvar = () => {
  localStorage.setItem(REG_KEY, JSON.stringify(registros));
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const horaAgora = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const minutosEntre = (h1, h2) => {
  const [a,b] = h1.split(':').map(Number);
  const [c,d] = h2.split(':').map(Number);
  return (c*60+d) - (a*60+b);
};

const formatarSaldo = (min) => {
  const sinal = min < 0 ? '-' : (min > 0 ? '+' : '');
  min = Math.abs(Math.round(min));
  return `${sinal}${Math.floor(min/60)}h${String(min%60).padStart(2,'0')}`;
};

const formatarDuracao = (min) => {
  min = Math.abs(Math.round(min));
  return `${Math.floor(min/60)}h${String(min%60).padStart(2,'0')}`;
};

const formatarDataBR = (iso) => iso.split('-').reverse().join('/');

function jornadaDiariaMin() {
  return minutosEntre(config.entradaPrevista, config.saidaAlmocoPrevista) +
         minutosEntre(config.voltaAlmocoPrevista, config.saidaPrevista);
}

// ============================================================
//  FLUXO DE PONTOS
// ============================================================
const SEQUENCIA = ['entrada', 'saida_almoco', 'volta_almoco', 'saida'];

const LABELS = {
  entrada:       'Entrada',
  saida_almoco:  'Saída Almoço',
  volta_almoco:  'Volta Almoço',
  saida:         'Saída'
};

function registrosDoDia(data) {
  return registros
    .filter(r => r.data === data)
    .sort((a,b) => a.hora.localeCompare(b.hora));
}

function proximoTipo(data = hojeISO()) {
  const feitos = registrosDoDia(data).map(r => r.tipo);
  return SEQUENCIA.find(t => !feitos.includes(t)) || null;
}

function baterPonto() {
  const tipo = proximoTipo();
  if (!tipo) {
    alert('Todos os pontos de hoje já foram registrados.');
    return;
  }
  registros.push({ id: Date.now(), data: hojeISO(), hora: horaAgora(), tipo });
  salvar();
  renderTudo();
}

function desfazerUltimo() {
  const doDia = registrosDoDia(hojeISO());
  if (!doDia.length) return;
  const ultimo = doDia[doDia.length - 1];
  if (!confirm(`Desfazer "${LABELS[ultimo.tipo]}" das ${ultimo.hora}?`)) return;
  registros = registros.filter(r => r.id !== ultimo.id);
  salvar();
  renderTudo();
}

// ============================================================
//  CÁLCULO DO DIA
// ============================================================
function calcularDia(data) {
  const doDia = registrosDoDia(data);
  if (!doDia.length) return null;

  const saida = [...doDia].reverse().find(r => r.tipo === 'saida');

  let trabalhado = 0;
  let ultimaEntrada = null;

  for (const r of doDia) {
    if (r.tipo === 'entrada' || r.tipo === 'volta_almoco') {
      ultimaEntrada = r.hora;
    } else if (r.tipo === 'saida_almoco' || r.tipo === 'saida') {
      if (ultimaEntrada) {
        trabalhado += minutosEntre(ultimaEntrada, r.hora);
        ultimaEntrada = null;
      }
    }
  }

  const esperado = jornadaDiariaMin();
  const saldo    = trabalhado - esperado;
  const incompleto = !saida;

  return {
    data,
    trabalhado,
    esperado,
    saldo,
    extra:      saldo > 0,
    devendo:    saldo < 0,
    incompleto,
    horaSaidaReal: saida ? saida.hora : null
  };
}

// ============================================================
//  RELATÓRIO MENSAL
// ============================================================
function gerarRelatorio(mes) {
  const dias = [...new Set(
    registros.filter(r => r.data.startsWith(mes)).map(r => r.data)
  )].sort();

  const resultados = dias.map(calcularDia).filter(Boolean);

  const [ano, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  let diasUteisMes = 0;
  for (let d = 1; d <= ultimoDia; d++) {
    const dia = new Date(ano, m-1, d).getDay();
    if (dia >= 1 && dia <= 5) diasUteisMes++;
  }

  const totalTrabalhado = resultados.reduce((s,d) => s + d.trabalhado, 0);
  const saldoMes        = resultados.reduce((s,d) => s + d.saldo, 0);

  return {
    resultados,
    totalTrabalhado,
    saldoMes,
    diasUteisMes,
    diasRegistrados:  resultados.filter(r => !r.incompleto).length,
    diasExtras:       resultados.filter(d => d.extra   && !d.incompleto),
    diasDevendo:      resultados.filter(d => d.devendo && !d.incompleto),
    diasIncompletos:  resultados.filter(d => d.incompleto)
  };
}

// ============================================================
//  MODAL DE EDIÇÃO DE DIA
// ============================================================
let diaEditando = null;

function abrirModalDia(data) {
  diaEditando = data;
  const modal = document.getElementById('modalDia');
  document.getElementById('modalTitulo').textContent = formatarDataBR(data);
  renderModalPontos();
  modal.classList.add('aberto');
}

function fecharModalDia() {
  document.getElementById('modalDia').classList.remove('aberto');
  diaEditando = null;
}

function renderModalPontos() {
  const doDia = registrosDoDia(diaEditando);
  const lista = document.getElementById('modalLista');
  const calc = calcularDia(diaEditando);

  if (!doDia.length) {
    lista.innerHTML = '<p class="vazio">Nenhum ponto registrado neste dia.</p>';
  } else {
    lista.innerHTML = doDia.map(r => `
      <div class="modal-ponto">
        <div class="modal-ponto-info">
          <strong>${LABELS[r.tipo]}</strong>
          <span>${r.hora}</span>
        </div>
        <div class="modal-ponto-acoes">
          <button onclick="editarPonto(${r.id})" class="btn-icone" title="Editar">✏️</button>
          <button onclick="excluirPonto(${r.id})" class="btn-icone" title="Excluir">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  // Rodapé com resumo do dia
  const rodape = document.getElementById('modalRodape');
  if (calc && !calc.incompleto) {
    rodape.innerHTML = `
      <div class="modal-resumo">
        <span>Trabalhado: <strong>${formatarDuracao(calc.trabalhado)}</strong></span>
        <span class="${calc.saldo >= 0 ? 'positivo' : 'negativo'}">
          Saldo: <strong>${formatarSaldo(calc.saldo)}</strong>
        </span>
      </div>
    `;
  } else if (calc) {
    rodape.innerHTML = `<div class="modal-resumo incompleto">⚠️ Dia incompleto — ${formatarDuracao(calc.trabalhado)} até agora</div>`;
  } else {
    rodape.innerHTML = '';
  }

  // Botões de adicionar (só mostra tipos que ainda não foram registrados)
  const tiposFeitos = doDia.map(r => r.tipo);
  const tiposDisponiveis = SEQUENCIA.filter(t => !tiposFeitos.includes(t));
  const divAdd = document.getElementById('modalAdicionar');

  if (tiposDisponiveis.length) {
    divAdd.innerHTML = `
      <p class="ajuda">Adicionar ponto:</p>
      <div class="modal-add-botoes">
        ${tiposDisponiveis.map(t => `
          <button onclick="adicionarPonto('${t}')" class="btn-add-tipo ${t}">
            + ${LABELS[t]}
          </button>
        `).join('')}
      </div>
    `;
  } else {
    divAdd.innerHTML = '<p class="ajuda">Todos os 4 pontos deste dia já foram registrados.</p>';
  }
}

window.editarPonto = (id) => {
  const ponto = registros.find(r => r.id === id);
  if (!ponto) return;

  const novaHora = prompt(
    `Editar horário de "${LABELS[ponto.tipo]}"\nHorário atual: ${ponto.hora}\n\nDigite o novo horário (formato HH:MM):`,
    ponto.hora
  );

  if (novaHora === null) return;

  const regex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  if (!regex.test(novaHora)) {
    alert('Horário inválido. Use o formato HH:MM (ex: 08:30).');
    return;
  }

  const [h, m] = novaHora.split(':');
  ponto.hora = `${h.padStart(2,'0')}:${m}`;
  salvar();
  renderModalPontos();
  renderTudo();
};

window.excluirPonto = (id) => {
  const ponto = registros.find(r => r.id === id);
  if (!ponto) return;
  if (!confirm(`Excluir "${LABELS[ponto.tipo]}" das ${ponto.hora}?`)) return;

  registros = registros.filter(r => r.id !== id);
  salvar();
  renderModalPontos();
  renderTudo();
};

window.adicionarPonto = (tipo) => {
  const hora = prompt(
    `Adicionar "${LABELS[tipo]}"\n\nDigite o horário (formato HH:MM):`,
    config[tipo === 'entrada' ? 'entradaPrevista'
         : tipo === 'saida_almoco' ? 'saidaAlmocoPrevista'
         : tipo === 'volta_almoco' ? 'voltaAlmocoPrevista'
         : 'saidaPrevista']
  );

  if (hora === null) return;

  const regex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  if (!regex.test(hora)) {
    alert('Horário inválido. Use o formato HH:MM (ex: 08:30).');
    return;
  }

  const [h, m] = hora.split(':');
  registros.push({
    id: Date.now(),
    data: diaEditando,
    hora: `${h.padStart(2,'0')}:${m}`,
    tipo
  });
  salvar();
  renderModalPontos();
  renderTudo();
};

// ============================================================
//  RENDERIZAÇÃO
// ============================================================
function renderBotaoPrincipal() {
  const btn    = document.getElementById('btnBaterPonto');
  const tipo   = proximoTipo();
  const status = document.getElementById('statusHoje');

  if (!tipo) {
    btn.textContent = 'Todos os pontos batidos ✓';
    btn.disabled = true;
    btn.className = 'btn-ponto completo';
  } else {
    btn.textContent = `Bater ${LABELS[tipo]}`;
    btn.disabled = false;
    btn.className = 'btn-ponto ' + tipo;
  }

  const doDia = registrosDoDia(hojeISO());
  if (doDia.length) {
    const lista = doDia.map(r =>
      `<div class="registro"><strong>${LABELS[r.tipo]}</strong><span>${r.hora}</span></div>`
    ).join('');
    status.innerHTML = lista +
      `<button id="btnDesfazer" class="link">Desfazer último ponto</button>`;
    document.getElementById('btnDesfazer').onclick = desfazerUltimo;
  } else {
    status.innerHTML = '<p class="vazio">Nenhum ponto registrado hoje.</p>';
  }

  const calc = calcularDia(hojeISO());
  const el = document.getElementById('saldoHoje');
  if (calc && !calc.incompleto) {
    el.textContent = `Saldo de hoje: ${formatarSaldo(calc.saldo)}`;
    el.className = 'saldo ' + (calc.saldo >= 0 ? 'positivo' : 'negativo');
  } else if (calc) {
    el.textContent = `Hoje: ${formatarDuracao(calc.trabalhado)} até agora`;
    el.className = 'saldo';
  } else {
    el.textContent = '';
    el.className = 'saldo';
  }
}

function renderHistorico() {
  const div = document.getElementById('listaHistorico');
  const dias = [...new Set(registros.map(r => r.data))].sort().reverse();

  if (!dias.length) {
    div.innerHTML = '<p class="vazio">Sem registros ainda.</p>';
    return;
  }

  div.innerHTML = dias.map(data => {
    const calc  = calcularDia(data);
    const doDia = registrosDoDia(data);
    const classe = calc.incompleto ? 'incompleto'
                 : calc.saldo >= 0 ? 'positivo' : 'negativo';

    const tags = doDia.map(r =>
      `<span class="tag">${LABELS[r.tipo].split(' ')[0]} ${r.hora}</span>`
    ).join('');

    return `
      <div class="dia-historico ${classe}" onclick="abrirModalDia('${data}')">
        <div class="cabecalho-dia">
          <strong>${formatarDataBR(data)}</strong>
          <span>${calc.incompleto ? '⚠️ Incompleto' : formatarSaldo(calc.saldo)}</span>
        </div>
        <div class="pontos-dia">${tags}</div>
        ${!calc.incompleto
          ? `<div class="resumo-dia">Trabalhou ${formatarDuracao(calc.trabalhado)}</div>`
          : ''}
      </div>
    `;
  }).join('');
}

function renderRelatorio() {
  const mes = document.getElementById('mesRelatorio').value;
  if (!mes) return;
  const r = gerarRelatorio(mes);

  document.getElementById('resumoMes').innerHTML = `
    <div class="card-resumo">
      <div class="destaque">
        <span class="rotulo">Saldo do mês</span>
        <span class="valor ${r.saldoMes >= 0 ? 'positivo' : 'negativo'}">
          ${formatarSaldo(r.saldoMes)}
        </span>
      </div>
      <div>
        <span class="rotulo">Total trabalhado</span>
        <span class="valor">${formatarDuracao(r.totalTrabalhado)}</span>
      </div>
      <div>
        <span class="rotulo">Dias úteis</span>
        <span class="valor">${r.diasUteisMes}</span>
      </div>
      <div>
        <span class="rotulo">Dias registrados</span>
        <span class="valor">${r.diasRegistrados} / ${r.diasUteisMes}</span>
      </div>
    </div>
  `;

  let html = '';

  html += `<h3>🟢 Horas extras (${r.diasExtras.length})</h3>`;
  html += r.diasExtras.length
    ? r.diasExtras.map(d => `
        <div class="linha-dia positivo">
          <span>${formatarDataBR(d.data)}</span>
          <span>saiu ${d.horaSaidaReal}</span>
          <span>${formatarSaldo(d.saldo)}</span>
        </div>`).join('')
    : '<p class="vazio">Nenhuma.</p>';

  html += `<h3>🔴 Horas devendo (${r.diasDevendo.length})</h3>`;
  html += r.diasDevendo.length
    ? r.diasDevendo.map(d => `
        <div class="linha-dia negativo">
          <span>${formatarDataBR(d.data)}</span>
          <span>trabalhou ${formatarDuracao(d.trabalhado)}</span>
          <span>${formatarSaldo(d.saldo)}</span>
        </div>`).join('')
    : '<p class="vazio">Nenhuma.</p>';

  if (r.diasIncompletos.length) {
    html += `<h3>⚠️ Dias incompletos (${r.diasIncompletos.length})</h3>`;
    html += r.diasIncompletos.map(d => `
      <div class="linha-dia incompleto">
        <span>${formatarDataBR(d.data)}</span>
        <span>pontos faltando</span>
        <span>—</span>
      </div>`).join('');
  }

  document.getElementById('detalheMes').innerHTML = html;
}

function renderConfig() {
  document.getElementById('entradaPrevista').value     = config.entradaPrevista;
  document.getElementById('saidaAlmocoPrevista').value = config.saidaAlmocoPrevista;
  document.getElementById('voltaAlmocoPrevista').value = config.voltaAlmocoPrevista;
  document.getElementById('saidaPrevista').value       = config.saidaPrevista;
  document.getElementById('infoJornada').textContent   =
    formatarDuracao(jornadaDiariaMin());
}

function atualizarBotaoFlutuante() {
  const btn = document.getElementById('btnAddRetro');
  if (!btn) return;
  const isHistorico = document.getElementById('tab-historico')?.classList.contains('active');
  btn.style.display = isHistorico ? 'flex' : 'none';
}

function renderTudo() {
  renderBotaoPrincipal();
  if (document.getElementById('tab-historico').classList.contains('active')) renderHistorico();
  if (document.getElementById('tab-relatorio').classList.contains('active')) renderRelatorio();
  if (document.getElementById('tab-config').classList.contains('active'))    renderConfig();
  atualizarBotaoFlutuante();
}

// ============================================================
//  MODAL DE PONTO RETROATIVO
// ============================================================
function abrirModalRetro() {
  const modal = document.getElementById('modalRetro');
  const hoje = hojeISO();

  document.getElementById('retroData').value = hoje;
  document.getElementById('retroData').max = hoje;
  document.getElementById('retroHora').value = horaAgora();
  document.getElementById('retroTipo').value = 'entrada';
  document.getElementById('retroAviso').textContent = '';

  atualizarAvisoRetro();
  modal.classList.add('aberto');
}

function fecharModalRetro() {
  document.getElementById('modalRetro').classList.remove('aberto');
}

function atualizarAvisoRetro() {
  const data = document.getElementById('retroData').value;
  const tipo = document.getElementById('retroTipo').value;
  const aviso = document.getElementById('retroAviso');

  if (!data) {
    aviso.textContent = '';
    return;
  }

  const doDia = registrosDoDia(data);
  const jaTem = doDia.some(r => r.tipo === tipo);

  if (jaTem) {
    aviso.className = 'retro-aviso erro';
    aviso.textContent = `⚠️ Já existe um ponto do tipo "${LABELS[tipo]}" nesse dia. Se salvar, ficará duplicado.`;
  } else {
    const faltam = SEQUENCIA.filter(t => !doDia.some(r => r.tipo === t));
    if (faltam.length) {
      aviso.className = 'retro-aviso info';
      aviso.textContent = `Este dia ainda está faltando: ${faltam.map(t => LABELS[t]).join(', ')}.`;
    } else {
      aviso.textContent = '';
    }
  }
}

function salvarRetro() {
  const data = document.getElementById('retroData').value;
  const tipo = document.getElementById('retroTipo').value;
  const hora = document.getElementById('retroHora').value;

  if (!data || !tipo || !hora) {
    alert('Preencha data, tipo e hora.');
    return;
  }

  if (data > hojeISO()) {
    alert('Não é possível adicionar ponto em data futura.');
    return;
  }

  const doDia = registrosDoDia(data);
  const jaTem = doDia.some(r => r.tipo === tipo);

  if (jaTem) {
    if (!confirm(`Já existe "${LABELS[tipo]}" nesse dia. Adicionar mesmo assim (ficará duplicado)?`)) {
      return;
    }
  }

  registros.push({
    id: Date.now(),
    data,
    hora,
    tipo
  });

  salvar();
  fecharModalRetro();
  renderTudo();
}

// ============================================================
//  EVENTOS
// ============================================================
document.getElementById('btnBaterPonto').onclick = baterPonto;

document.querySelectorAll('nav button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    renderTudo();
  };
});

document.getElementById('mesRelatorio').onchange = renderRelatorio;

document.getElementById('salvarConfig').onclick = () => {
  config.entradaPrevista     = document.getElementById('entradaPrevista').value;
  config.saidaAlmocoPrevista = document.getElementById('saidaAlmocoPrevista').value;
  config.voltaAlmocoPrevista = document.getElementById('voltaAlmocoPrevista').value;
  config.saidaPrevista       = document.getElementById('saidaPrevista').value;

  salvar();
  alert(`Configurações salvas!\nJornada diária: ${formatarDuracao(jornadaDiariaMin())}`);
  renderConfig();
  renderTudo();
};

// Fechar modal de edição ao tocar fora ou no botão X
document.getElementById('fecharModal').onclick = fecharModalDia;
document.getElementById('modalDia').onclick = (e) => {
  if (e.target.id === 'modalDia') fecharModalDia();
};

// Eventos do modal retroativo
document.getElementById('btnAddRetro').onclick = abrirModalRetro;
document.getElementById('fecharRetro').onclick = fecharModalRetro;
document.getElementById('btnSalvarRetro').onclick = salvarRetro;
document.getElementById('retroData').onchange = atualizarAvisoRetro;
document.getElementById('retroTipo').onchange = atualizarAvisoRetro;

document.getElementById('modalRetro').onclick = (e) => {
  if (e.target.id === 'modalRetro') fecharModalRetro();
};

// Exportar backup
document.getElementById('exportarDados').onclick = () => {
  const backup = { config, registros, versao: 4, exportadoEm: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `meu-ponto-backup-${hojeISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

document.getElementById('importarDados').onclick = () => {
  document.getElementById('arquivoImport').click();
};

document.getElementById('arquivoImport').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const dados = JSON.parse(ev.target.result);
      if (!dados.registros || !dados.config) throw new Error('Arquivo inválido');
      if (!confirm('Isso substituirá os dados atuais. Continuar?')) return;
      config    = dados.config;
      registros = dados.registros;
      salvar();
      renderTudo();
      alert('Backup restaurado com sucesso!');
    } catch (err) {
      alert('Erro ao importar: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
};

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
document.getElementById('mesRelatorio').value = hojeISO().slice(0,7);
renderTudo();