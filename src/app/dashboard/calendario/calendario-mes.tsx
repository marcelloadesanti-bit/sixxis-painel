"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventoCalendario } from "@/lib/google/calendar";
import { criarEventoAction } from "./actions";

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const NOMES_MES = [
    "Janeiro",
    "Fevereiro",
    "Marco",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

function chaveDia(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function chaveDoEvento(evento: EventoCalendario): string {
    return evento.inicio.slice(0, 10);
}

function gerarGrade(ano: number, mes: number): Date[] {
    const primeiroDiaMes = new Date(ano, mes, 1);
    const inicioGrade = new Date(primeiroDiaMes);
    inicioGrade.setDate(inicioGrade.getDate() - primeiroDiaMes.getDay());
    const dias: Date[] = [];
    for (let i = 0; i < 42; i++) {
          const d = new Date(inicioGrade);
          d.setDate(inicioGrade.getDate() + i);
          dias.push(d);
    }
    return dias;
}

function formatarHora(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

type Props = {
    eventosIniciais: EventoCalendario[];
    conectadoGoogle: boolean;
    podeEditar: boolean;
};

export default function CalendarioMes({ eventosIniciais, conectadoGoogle, podeEditar }: Props) {
    const hoje = new Date();
    const [ano, setAno] = useState(hoje.getFullYear());
    const [mes, setMes] = useState(hoje.getMonth());
    const [eventos, setEventos] = useState<EventoCalendario[]>(eventosIniciais);
    const [carregando, setCarregando] = useState(false);
    const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null);
    const [mostrarForm, setMostrarForm] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);

  const grade = useMemo(() => gerarGrade(ano, mes), [ano, mes]);

  useEffect(() => {
        if (!conectadoGoogle) return;
        const inicio = grade[0];
        const fim = new Date(grade[grade.length - 1]);
        fim.setDate(fim.getDate() + 1);
        setCarregando(true);
        fetch(`/api/google-calendar/eventos?inicio=${encodeURIComponent(inicio.toISOString())}&fim=${encodeURIComponent(fim.toISOString())}`)
          .then((res) => res.json())
          .then((data) => {
                    if (data.eventos) setEventos(data.eventos);
          })
          .catch(() => {})
          .finally(() => setCarregando(false));
  }, [ano, mes, conectadoGoogle]);

  const eventosPorDia = useMemo(() => {
        const mapa = new Map<string, EventoCalendario[]>();
        for (const evento of eventos) {
                const chave = chaveDoEvento(evento);
                const lista = mapa.get(chave) ?? [];
                lista.push(evento);
                mapa.set(chave, lista);
        }
        return mapa;
  }, [eventos]);

  function recarregarEventos() {
        if (!conectadoGoogle) return;
        const inicio = grade[0];
        const fim = new Date(grade[grade.length - 1]);
        fim.setDate(fim.getDate() + 1);
        fetch(`/api/google-calendar/eventos?inicio=${encodeURIComponent(inicio.toISOString())}&fim=${encodeURIComponent(fim.toISOString())}`)
          .then((res) => res.json())
          .then((data) => {
                    if (data.eventos) setEventos(data.eventos);
          })
          .catch(() => {});
  }

  function irParaHoje() {
        const h = new Date();
        setAno(h.getFullYear());
        setMes(h.getMonth());
  }

  function mesAnterior() {
        if (mes === 0) {
                setMes(11);
                setAno(ano - 1);
        } else {
                setMes(mes - 1);
        }
  }

  function mesSeguinte() {
        if (mes === 11) {
                setMes(0);
                setAno(ano + 1);
        } else {
                setMes(mes + 1);
        }
  }

  function abrirNovoEvento(dia?: Date) {
        setDiaSelecionado(dia ?? new Date());
        setMostrarForm(true);
        setErro(null);
  }

  async function handleSubmitEvento(formData: FormData) {
        setErro(null);
        setSalvando(true);
        const resultado = await criarEventoAction(formData);
        setSalvando(false);
        if (resultado?.erro) {
                setErro(resultado.erro);
                return;
        }
        setMostrarForm(false);
        setDiaSelecionado(null);
        recarregarEventos();
  }

  const diaSelecionadoChave = diaSelecionado ? chaveDia(diaSelecionado) : null;
    const eventosDoDiaSelecionado = diaSelecionadoChave ? eventosPorDia.get(diaSelecionadoChave) ?? [] : [];
    const hojeChave = chaveDia(new Date());

  return (<div className="mb-6 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"> <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4 dark:border-gray-700"> <div className="flex items-center gap-2"> <button type="button" onClick={irParaHoje} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Hoje</button> <button type="button" onClick={mesAnterior} aria-label="Mes anterior" className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">{"<"}</button> <button type="button" onClick={mesSeguinte} aria-label="Proximo mes" className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">{">"}</button> <h3 className="ml-2 text-base font-semibold text-[var(--color-sixxis-navy)] dark:text-white">{NOMES_MES[mes]} {ano}</h3> {carregando && <span className="text-xs text-gray-400">Atualizando...</span>} </div> {podeEditar && conectadoGoogle && (<button type="button" onClick={() => abrirNovoEvento(new Date())} className="rounded bg-[var(--color-sixxis-navy)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">+ Novo evento</button>)} </div> <div className="grid grid-cols-7 border-b border-gray-200 text-center text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"> {DIAS_SEMANA.map((dia) => (<div key={dia} className="p-2 uppercase">{dia}</div>))} </div> <div className="grid grid-cols-7"> {grade.map((dia) => { const chave = chaveDia(dia); const doMesAtual = dia.getMonth() === mes; const eventosDoDia = eventosPorDia.get(chave) ?? []; const ehHoje = chave === hojeChave; return (<button key={chave} type="button" onClick={() => setDiaSelecionado(dia)} className={`min-h-[90px] border-b border-r border-gray-100 p-1.5 text-left align-top dark:border-gray-700 ${doMesAtual ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-900"} hover:bg-gray-50 dark:hover:bg-gray-700`}><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${ehHoje ? "bg-[var(--color-sixxis-navy)] font-semibold text-white" : doMesAtual ? "text-gray-700 dark:text-gray-200" : "text-gray-300 dark:text-gray-600"}`}>{dia.getDate()}</span> <div className="mt-1 space-y-0.5"> {eventosDoDia.slice(0, 3).map((evento) => (<div key={evento.id} className="truncate rounded bg-[var(--color-sixxis-navy)]/10 px-1 py-0.5 text-[10px] text-[var(--color-sixxis-navy)] dark:bg-blue-900/40 dark:text-blue-200">{evento.diaTodo ? "" : `${formatarHora(evento.inicio)} `}{evento.titulo}</div>))} {eventosDoDia.length > 3 && (<div className="text-[10px] text-gray-400">+{eventosDoDia.length - 3} mais</div>)} </div></button>); })} </div> {diaSelecionado && !mostrarForm && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDiaSelecionado(null)}><div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800" onClick={(e) => e.stopPropagation()}> <div className="mb-3 flex items-center justify-between"> <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{diaSelecionado.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</h4> <button type="button" onClick={() => setDiaSelecionado(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Fechar</button> </div> {eventosDoDiaSelecionado.length === 0 ? (<p className="text-sm text-gray-400">Nenhum evento neste dia.</p>) : (<ul className="mb-3 space-y-2"> {eventosDoDiaSelecionado.map((evento) => (<li key={evento.id} className="rounded border border-gray-200 p-2 text-sm dark:border-gray-700"><p className="font-medium text-gray-800 dark:text-gray-100">{evento.titulo}</p><p className="text-xs text-gray-400">{evento.diaTodo ? "Dia inteiro" : `${formatarHora(evento.inicio)} - ${formatarHora(evento.fim)}`}{evento.convidados.length > 0 ? ` - Convidados: ${evento.convidados.join(", ")}` : ""}</p></li>))} </ul>)} {podeEditar && conectadoGoogle && (<button type="button" onClick={() => setMostrarForm(true)} className="w-full rounded bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Adicionar evento neste dia</button>)} </div></div>)} {mostrarForm && diaSelecionado && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setMostrarForm(false)}><form action={handleSubmitEvento} className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800" onClick={(e) => e.stopPropagation()}> <div className="mb-1 flex items-center justify-between"> <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Novo evento</h4> <button type="button" onClick={() => setMostrarForm(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Fechar</button> </div> {erro && (<p className="rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>)} <input name="titulo" placeholder="Titulo" required className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" /> <input type="date" name="data" defaultValue={chaveDia(diaSelecionado)} required className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" /> <div className="flex gap-2"> <input type="time" name="horaInicio" defaultValue="09:00" required className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" /> <input type="time" name="horaFim" defaultValue="10:00" required className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" /> </div> <input name="convidados" placeholder="Convidados (emails separados por virgula)" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" /> <textarea name="descricao" placeholder="Descricao (opcional)" rows={2} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" /> <button type="submit" disabled={salvando} className="w-full rounded bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{salvando ? "Salvando..." : "Salvar evento"}</button></form></div>)} </div>);
}
