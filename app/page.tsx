"use client";

import { useEffect, useMemo, useState } from "react";
import { ensureAnonymousUser } from "../lib/auth";
import { registerPushSubscription } from "../lib/push";
import { supabase } from "../lib/supabase";

type MainTab = "Hoje" | "Calendário" | "Hábitos" | "Mais";
type MoreTab = "Ritmo" | "Tarefas" | "Eisenhower" | "Foco" | "Contagens" | "Ideias" | "Perfil";
type Priority = 0 | 1 | 2 | 3;
type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
type TaskKind = "task" | "event" | "birthday";
type HabitFrequency = "daily" | "weekly" | "monthly" | "custom";
type DayPeriod = "Manhã" | "Tarde" | "Noite" | "Outro";

type CategoryDef = {
  id: string;
  name: string;
  color: string;
};

type Step = { id: string; text: string; done: boolean };

type Task = {
  id: string;
  kind: TaskKind;
  title: string;
  notes: string;
  date: string;
  start?: string;
  minutes: number;
  category: string;
  priority: Priority;
  done: boolean;
  tags: string[];
  project?: string;
  recurring: Recurrence;
  recurrenceDays: number[];
  recurrenceEnd?: string;
  reminder?: string;
  steps: Step[];
};

type Habit = {
  id: string;
  title: string;
  category: string;
  frequency: HabitFrequency;
  days: number[];
  goal: number;
  unit: string;
  logs: Record<string, number>;
  time?: string;
  minutes?: number;
  period?: DayPeriod;
  startDate: string;
  endDate?: string;
  reminder?: string;
  archived?: boolean;
};

type Idea = {
  id: string;
  title: string;
  note: string;
  category: string;
  tags: string[];
};

type Countdown = {
  id: string;
  title: string;
  date: string;
  category: string;
};

type AppState = {
  appName: string;
  userName: string;
  accent: string;
  categories: CategoryDef[];
  tasks: Task[];
  habits: Habit[];
  ideas: Idea[];
  countdowns: Countdown[];
};

const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: "profissional", name: "Profissional", color: "#6585c2" },
  { id: "pessoal", name: "Pessoal", color: "#da8b78" },
  { id: "saude", name: "Saúde", color: "#68a88b" },
  { id: "criatividade", name: "Criatividade", color: "#d2a54e" },
  { id: "estudos", name: "Estudos", color: "#8b7db7" },
  { id: "casa", name: "Casa", color: "#9b88a5" },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const iso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const offsetISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};
const fmtShort = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(
    new Date(`${date}T12:00:00`)
  );
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
};
const between = (date: string, start: Date, end: Date) => {
  const d = new Date(`${date}T12:00:00`);
  return d >= start && d <= end;
};
const catColor = (defs: CategoryDef[], name: string) =>
  defs.find((c) => c.name === name)?.color || "#8b939b";
const catBg = (defs: CategoryDef[], name: string) => `${catColor(defs, name)}20`;
const firstCategory = (state: AppState) => state.categories[0]?.name || "Pessoal";
const timeSortValue = (time?: string) => {
  if (!time) return 24 * 60 + 1;
  const [h, m] = time.split(":").map(Number);
  return (Number.isFinite(h) ? h : 24) * 60 + (Number.isFinite(m) ? m : 0);
};

const durationLabel = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
};
const taskKindLabel = (kind: TaskKind) =>
  kind === "event" ? "Evento" : kind === "birthday" ? "Aniversário" : "Tarefa";
const taskOccursOnDate = (task: Task, date: string) => {
  if (task.kind === "birthday" || task.recurring === "yearly") {
    return task.date.slice(5) === date.slice(5);
  }
  return task.date === date;
};
const timeRangeLabel = (task: Task) => {
  if (!task.start) return "Sem horário";
  if (!task.minutes || task.minutes <= 0) return task.start;
  const [hh, mm] = task.start.split(":").map(Number);
  const total = hh * 60 + mm + task.minutes;
  const endH = Math.floor((total % (24 * 60)) / 60);
  const endM = total % 60;
  return `${task.start}–${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
};
const habitOccursOnDate = (habit: Habit, date: string) => {
  if (habit.archived) return false;
  if (habit.startDate && date < habit.startDate) return false;
  if (habit.endDate && date > habit.endDate) return false;

  const d = new Date(`${date}T12:00:00`);
  const dayIndex = d.getDay();

  if (habit.frequency === "daily") return true;
  if (habit.frequency === "weekly" || habit.frequency === "custom") {
    return habit.days.includes(dayIndex);
  }
  if (habit.frequency === "monthly") {
    const startDay = new Date(`${habit.startDate}T12:00:00`).getDate();
    return d.getDate() === startDay;
  }
  return false;
};
const habitTimeRangeLabel = (habit: Habit) => {
  if (!habit.time) return "Sem horário";
  if (!habit.minutes || habit.minutes <= 0) return habit.time;
  const [hh, mm] = habit.time.split(":").map(Number);
  const total = hh * 60 + mm + habit.minutes;
  const endH = Math.floor((total % (24 * 60)) / 60);
  const endM = total % 60;
  return `${habit.time}–${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
};
const habitQuickAmounts = (habit: Habit) => {
  const unit = habit.unit.trim().toLowerCase();
  if (unit === "ml" || unit.includes("mililit")) return [200, 300, 500];
  if (unit === "l" || unit.includes("litro")) return [0.2, 0.3, 0.5];
  if (habit.goal <= 1) return [1];
  if (habit.goal <= 10) return [1, 2, 5];
  return [1, 5, 10];
};
const WEEKDAYS = [
  { n: 0, label: "dom" },
  { n: 1, label: "seg" },
  { n: 2, label: "ter" },
  { n: 3, label: "qua" },
  { n: 4, label: "qui" },
  { n: 5, label: "sex" },
  { n: 6, label: "sáb" },
];

const seed: AppState = {
  appName: "Meu Ritmo",
  userName: "Pâmela",
  accent: "#24364b",
  categories: DEFAULT_CATEGORIES,
  tasks: [],
  habits: [],
  ideas: [],
  countdowns: [],
};

function migrateState(raw: any): AppState {
  const categories =
    Array.isArray(raw?.categories) && raw.categories.length
      ? raw.categories
      : DEFAULT_CATEGORIES;

  const fallbackCategory = categories[0]?.name || "Pessoal";

  return {
    ...seed,
    ...raw,
    categories,
    tasks: Array.isArray(raw?.tasks)
      ? raw.tasks.map((t: any) => ({
          ...t,
          kind: t.kind || "task",
          category: t.category || fallbackCategory,
          project: t.project || "",
          recurring: t.kind === "birthday" ? "yearly" : t.recurring || "none",
          recurrenceDays: Array.isArray(t.recurrenceDays) ? t.recurrenceDays : [],
          recurrenceEnd: t.recurrenceEnd || "",
          reminder: t.reminder || "none",
          steps: Array.isArray(t.steps) ? t.steps : [],
          tags: Array.isArray(t.tags) ? t.tags : [],
        }))
      : [],
    habits: Array.isArray(raw?.habits)
      ? raw.habits.map((h: any) => ({
          ...h,
          category: h.category || fallbackCategory,
          frequency: h.frequency || "daily",
          days: Array.isArray(h.days) ? h.days : [0, 1, 2, 3, 4, 5, 6],
          startDate: h.startDate || iso(),
          reminder: h.reminder || "none",
          period: h.period || "Outro",
          logs: h.logs || {},
        }))
      : [],
    ideas: Array.isArray(raw?.ideas)
      ? raw.ideas.map((i: any) => ({
          ...i,
          category: i.category || fallbackCategory,
          tags: Array.isArray(i.tags) ? i.tags : [],
        }))
      : [],
    countdowns: Array.isArray(raw?.countdowns)
      ? raw.countdowns.map((c: any) => ({
          ...c,
          category: c.category || fallbackCategory,
        }))
      : [],
  };
}

export default function Home() {
  const [state, setState] = useState<AppState>(seed);
  const [tab, setTab] = useState<MainTab>("Hoje");
  const [more, setMore] = useState<MoreTab>("Ritmo");
  const [hydrated, setHydrated] = useState(false);

  const [composer, setComposer] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [taskInitial, setTaskInitial] = useState<Partial<Task> | null>(null);
  const [sourceIdeaId, setSourceIdeaId] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [globalHabitComposer, setGlobalHabitComposer] = useState(false);
  const [globalEditHabit, setGlobalEditHabit] = useState<Habit | null>(null);
  const [globalIdeaComposer, setGlobalIdeaComposer] = useState(false);

  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [focusSecs, setFocusSecs] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    ensureAnonymousUser();
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("meu-ritmo-v2.3");
    if (raw) {
      try {
        setState(migrateState(JSON.parse(raw)));
      } catch {}
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem("meu-ritmo-v2.3", JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!running || focusSecs <= 0) return;
    const x = setInterval(() => setFocusSecs((s) => s - 1), 1000);
    return () => clearInterval(x);
  }, [running, focusSecs]);

  useEffect(() => {
    if (focusSecs === 0) setRunning(false);
  }, [focusSecs]);


  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{
        id: string;
        value: number;
        date: string;
      }>;

      setState((s) => ({
        ...s,
        habits: s.habits.map((h) =>
          h.id === custom.detail.id
            ? {
                ...h,
                logs: {
                  ...h.logs,
                  [custom.detail.date]: custom.detail.value,
                },
              }
            : h
        ),
      }));
    };

    window.addEventListener("meu-ritmo-toggle-habit", handler);
    return () => window.removeEventListener("meu-ritmo-toggle-habit", handler);
  }, []);

  useEffect(() => {
    if (
      !hydrated ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;

    const check = async () => {
      const now = new Date();
      const stamp = `${iso(now)}-${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes()
      ).padStart(2, "0")}`;
      const sent = JSON.parse(
        localStorage.getItem("meu-ritmo-notified") || "[]"
      ) as string[];

      for (const t of state.tasks) {
        if (
          t.done ||
          !t.start ||
          !t.reminder ||
          t.reminder === "none"
        )
          continue;

        const minsBefore = Number(t.reminder) || 0;
        const target = new Date(`${t.date}T${t.start}:00`);
        target.setMinutes(target.getMinutes() - minsBefore);
        const targetStamp = `${iso(target)}-${String(target.getHours()).padStart(
          2,
          "0"
        )}:${String(target.getMinutes()).padStart(2, "0")}`;
        const key = `${t.id}-${targetStamp}`;

        if (stamp === targetStamp && !sent.includes(key)) {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification("Meu Ritmo", {
            body: `${t.title}${
              minsBefore ? ` começa em ${minsBefore} min` : " começa agora"
            }.`,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: key,
          });
          localStorage.setItem(
            "meu-ritmo-notified",
            JSON.stringify([...sent, key].slice(-100))
          );
        }
      }
    };

    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [hydrated, state.tasks]);

  const toggleTask = (id: string) =>
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));

  const deleteTask = (id: string) =>
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));

  const saveTask = (task: Task) =>
    setState((s) => ({
      ...s,
      tasks: s.tasks.some((t) => t.id === task.id)
        ? s.tasks.map((t) => (t.id === task.id ? task : t))
        : [...s.tasks, task],
      ideas: sourceIdeaId
        ? s.ideas.filter((i) => i.id !== sourceIdeaId)
        : s.ideas,
    }));

  const startFocus = (task: Task) => {
    setFocusTask(task);
    setFocusSecs(Math.max(task.minutes, 1) * 60);
    setRunning(true);
  };

  const openIdeaAsTask = (idea: Idea) => {
    setTaskInitial({
      kind: "task",
      title: idea.title,
      notes: idea.note,
      category: idea.category,
      tags: idea.tags,
      minutes: 0,
      date: iso(),
      priority: 1,
      recurring: "none",
      recurrenceDays: [],
      reminder: "none",
      steps: [],
    });
    setSourceIdeaId(idea.id);
    setComposer(true);
  };

  const closeComposer = () => {
    setComposer(false);
    setTaskInitial(null);
    setSourceIdeaId(null);
  };

  return (
    <main className="min-h-screen px-3 py-4 sm:py-8">
      <div className="phone-shell mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[440px] flex-col overflow-hidden rounded-[34px] border border-white/80 bg-[#fffdf9] sm:min-h-[820px]">
        <section className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 pb-7 pt-5 sm:px-6">
            <TopBar
              state={state}
              onProfile={() => {
                setTab("Mais");
                setMore("Perfil");
              }}
            />

            {tab === "Hoje" && (
              <Today
                state={state}
                toggleTask={toggleTask}
                edit={setEditTask}
              />
            )}

            {tab === "Calendário" && (
              <CalendarView
                state={state}
                toggleTask={toggleTask}
                edit={setEditTask}
                editHabit={setGlobalEditHabit}
              />
            )}

            {tab === "Hábitos" && (
              <HabitsView state={state} setState={setState} />
            )}

            {tab === "Mais" && (
              <MoreHub
                active={more}
                setActive={setMore}
                state={state}
                setState={setState}
                toggleTask={toggleTask}
                edit={setEditTask}
                startFocus={startFocus}
                convertIdea={openIdeaAsTask}
              />
            )}
          </div>

          <BottomNav
            tab={tab}
            setTab={setTab}
            onAdd={() => setAddMenu(true)}
          />
        </section>
      </div>

      {composer && (
        <TaskComposer
          state={state}
          initial={taskInitial || undefined}
          close={closeComposer}
          save={(t) => {
            saveTask(t);
            closeComposer();
          }}
        />
      )}

      {editTask && (
        <TaskComposer
          state={state}
          task={editTask}
          close={() => setEditTask(null)}
          save={(t) => {
            saveTask(t);
            setEditTask(null);
          }}
          remove={() => {
            deleteTask(editTask.id);
            setEditTask(null);
          }}
        />
      )}

      {addMenu && (
        <AddMenu
          close={() => setAddMenu(false)}
          choose={(kind) => {
            setAddMenu(false);
            if (kind === "habit") {
              setGlobalHabitComposer(true);
              return;
            }
            if (kind === "idea") {
              setGlobalIdeaComposer(true);
              return;
            }
            setSourceIdeaId(null);
            setTaskInitial({
              kind,
              date: iso(),
              minutes: 0,
              priority: kind === "task" ? 1 : 0,
              recurring: kind === "birthday" ? "yearly" : "none",
              recurrenceDays: [],
              reminder: "none",
              steps: [],
            });
            setComposer(true);
          }}
        />
      )}

      {globalHabitComposer && (
        <HabitComposer
          state={state}
          close={() => setGlobalHabitComposer(false)}
          save={(h) => {
            setState((x) => ({ ...x, habits: [...x.habits, h] }));
            setGlobalHabitComposer(false);
          }}
        />
      )}

      {globalEditHabit && (
        <HabitComposer
          state={state}
          habit={globalEditHabit}
          close={() => setGlobalEditHabit(null)}
          save={(h) => {
            setState((x) => ({
              ...x,
              habits: x.habits.map((item) => (item.id === h.id ? h : item)),
            }));
            setGlobalEditHabit(null);
          }}
          remove={() => {
            setState((x) => ({
              ...x,
              habits: x.habits.filter((item) => item.id !== globalEditHabit.id),
            }));
            setGlobalEditHabit(null);
          }}
        />
      )}

      {globalIdeaComposer && (
        <IdeaComposer
          state={state}
          close={() => setGlobalIdeaComposer(false)}
          save={(idea) => {
            setState((x) => ({ ...x, ideas: [...x.ideas, idea] }));
            setGlobalIdeaComposer(false);
          }}
        />
      )}

      {focusTask && (
        <FocusSheet
          task={focusTask}
          state={state}
          secs={focusSecs}
          running={running}
          toggle={() => setRunning((r) => !r)}
          close={() => {
            setFocusTask(null);
            setRunning(false);
          }}
          finish={() => {
            setState((s) => ({
              ...s,
              tasks: s.tasks.map((t) =>
                t.id === focusTask.id ? { ...t, done: true } : t
              ),
            }));
            setFocusTask(null);
            setRunning(false);
          }}
        />
      )}
    </main>
  );
}

function TopBar({
  state,
  onProfile,
}: {
  state: AppState;
  onProfile: () => void;
}) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div
          className="grid h-10 w-10 place-items-center rounded-2xl text-lg font-bold text-white"
          style={{ background: state.accent }}
        >
          ↗
        </div>
        <div>
          <div className="text-[18px] font-semibold leading-none tracking-tight">
            {state.appName}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[.14em] text-[#8a929c]">
            um pouco por vez
          </div>
        </div>
      </div>

      <button
        onClick={onProfile}
        className="grid h-9 w-9 place-items-center rounded-full border border-[#ded8cf] bg-white text-xs font-semibold"
      >
        {state.userName.trim().charAt(0).toUpperCase() || "P"}
      </button>
    </div>
  );
}

function BottomNav({
  tab,
  setTab,
  onAdd,
}: {
  tab: MainTab;
  setTab: (t: MainTab) => void;
  onAdd: () => void;
}) {
  const item = (name: MainTab, icon: string) => (
    <button
      onClick={() => setTab(name)}
      className={`nav-item ${tab === name ? "active" : ""}`}
    >
      <span className="nav-icon">{icon}</span>
      <span>{name}</span>
    </button>
  );

  return (
    <nav className="app-bottom-nav z-50 border-t border-[#e2ddd5] bg-[#fffdf9]/95 px-2 pb-2 pt-2 backdrop-blur">
      <div className="grid grid-cols-5 items-end">
        {item("Hoje", "☀️")}
        {item("Calendário", "🗓️")}
        <button className="fab" onClick={onAdd}>
          ＋
        </button>
        {item("Hábitos", "🌱")}
        {item("Mais", "✨")}
      </div>
    </nav>
  );
}

function AddMenu({
  close,
  choose,
}: {
  close: () => void;
  choose: (kind: TaskKind | "habit" | "idea") => void;
}) {
  const options: { kind: TaskKind | "habit" | "idea"; icon: string; title: string; text: string }[] = [
    { kind: "task", icon: "✅", title: "Tarefa", text: "Algo que você precisa fazer." },
    { kind: "habit", icon: "🌱", title: "Hábito", text: "Algo que se repete na sua rotina." },
    { kind: "event", icon: "🗓️", title: "Evento", text: "Um compromisso com data e horário." },
    { kind: "birthday", icon: "🎂", title: "Aniversário", text: "Volta automaticamente todos os anos." },
    { kind: "idea", icon: "💡", title: "Ideia", text: "Guarde agora e organize depois." },
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <strong>O que você quer adicionar?</strong>
            <p className="mt-1 text-xs text-[#87909a]">Escolha o tipo para abrir o formulário certo.</p>
          </div>
          <button onClick={close} className="text-xl">×</button>
        </div>
        <div className="space-y-2">
          {options.map((option) => (
            <button
              key={option.kind}
              onClick={() => choose(option.kind)}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#e2ddd5] bg-white p-3 text-left"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4efe8] text-base font-bold">
                {option.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{option.title}</span>
                <span className="mt-0.5 block text-xs text-[#87909a]">{option.text}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Today({
  state,
  toggleTask,
  edit,
}: {
  state: AppState;
  toggleTask: (id: string) => void;
  edit: (t: Task) => void;
}) {
  const today = iso();
  const tasksToday = [...state.tasks]
    .filter((t) => taskOccursOnDate(t, today))
    .sort((a, b) => {
      if (a.done !== b.done) return Number(a.done) - Number(b.done);
      if (a.start && b.start) return a.start.localeCompare(b.start);
      if (a.start) return -1;
      if (b.start) return 1;
      return b.priority - a.priority;
    });

  const dayIndex = new Date().getDay();
  const habitsToday = state.habits
    .filter((h) => !h.archived)
    .filter((h) => {
      if (h.startDate && today < h.startDate) return false;
      if (h.endDate && today > h.endDate) return false;
      if (h.frequency === "daily") return true;
      if (h.frequency === "weekly" || h.frequency === "custom") {
        return h.days.includes(dayIndex);
      }
      if (h.frequency === "monthly") {
        const startDay = new Date(`${h.startDate}T12:00:00`).getDate();
        return new Date().getDate() === startDay;
      }
      return false;
    })
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  const actionableTasks = tasksToday.filter((t) => t.kind === "task");
  const completedTasks = actionableTasks.filter((t) => t.done).length;
  const completedHabits = habitsToday.filter(
    (h) => (h.logs[today] || 0) >= h.goal
  ).length;

  const toggleHabit = (habit: Habit) => {
    setTimeout(() => {}, 0);
  };

  return (
    <div>
      <header className="mb-5">
        <p className="text-xs capitalize text-[#87909a]">
          {new Intl.DateTimeFormat("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date())}
        </p>
        <h1 className="mt-1 text-[29px] font-semibold tracking-tight">
          Hoje
        </h1>
        <p className="mt-1 text-[13px] text-[#7d8794]">
          Vai fazendo no seu ritmo e marcando o que concluir.
        </p>
      </header>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[#88919b]">
            Tarefas e eventos
          </div>
          <span className="text-[11px] text-[#88919b]">
            {completedTasks}/{actionableTasks.length}
          </span>
        </div>

        <div className="space-y-2">
          {tasksToday.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              defs={state.categories}
              toggle={toggleTask}
              edit={edit}
            />
          ))}
        </div>

        {!tasksToday.length && (
          <section className="soft-card p-4 text-center">
            <div className="text-sm font-semibold">Nada pendente por aqui ✨</div>
            <p className="mt-1 text-xs text-[#7e8790]">
              Se aparecer vontade, dá até para encaixar algo leve que te faça bem.
            </p>
          </section>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[#88919b]">
            Hábitos
          </div>
          <span className="text-[11px] text-[#88919b]">
            {completedHabits}/{habitsToday.length}
          </span>
        </div>

        <div className="space-y-2">
          {habitsToday.map((h) => {
            const current = h.logs[today] || 0;
            const done = current >= h.goal;
            const quantitative = h.goal > 1 || h.unit.trim().toLowerCase() !== "vez";

            const setValue = (value: number) =>
              window.dispatchEvent(
                new CustomEvent("meu-ritmo-toggle-habit", {
                  detail: { id: h.id, value: Math.max(0, value), date: today },
                })
              );

            const register = () => {
              if (!quantitative) {
                setValue(done ? 0 : h.goal);
                return;
              }

              const raw = window.prompt(
                `Quanto deseja registrar em ${h.unit}?`,
                ""
              );
              if (!raw) return;
              const amount = Number(raw.replace(",", "."));
              if (!Number.isFinite(amount) || amount <= 0) return;
              setValue(current + amount);
            };

            return (
              <div
                key={h.id}
                className="flex items-center gap-3 rounded-2xl border border-[#e2ddd5] bg-white p-3"
              >
                <button
                  onClick={() => !quantitative && setValue(done ? 0 : h.goal)}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${
                    done ? "bg-[#24364b] text-white" : ""
                  } ${quantitative ? "cursor-default" : ""}`}
                >
                  {done ? "✓" : ""}
                </button>

                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-sm font-semibold ${
                      done && !quantitative ? "line-through text-[#9aa1a8]" : ""
                    }`}
                  >
                    {h.title}
                  </div>
                  <div className="mt-1 text-[11px] text-[#88919b]">
                    {quantitative
                      ? `${current} / ${h.goal} ${h.unit}`
                      : "Hábito"}
                    {h.time ? ` · ${h.time}` : ""}
                    {h.minutes ? ` · ${durationLabel(h.minutes)}` : ""}
                  </div>
                  {quantitative && (
                    <div className="mt-2 progressbar">
                      <div
                        style={{
                          width: `${Math.min(100, (current / Math.max(h.goal, 1)) * 100)}%`,
                          background: catColor(state.categories, h.category),
                        }}
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={register}
                  className={`shrink-0 rounded-xl px-3 py-2 text-[11px] font-bold ${
                    done && !quantitative
                      ? "border border-[#ddd7cf] bg-white text-[#68737e]"
                      : "bg-[#24364b] text-white"
                  }`}
                >
                  {quantitative ? "+ registrar" : done ? "Desmarcar" : "Concluir"}
                </button>
              </div>
            );
          })}
        </div>

        {!habitsToday.length && (
          <section className="soft-card p-4 text-center">
            <div className="text-sm font-semibold">Hoje está mais leve 🌿</div>
            <p className="mt-1 text-xs text-[#7e8790]">
              Só aparecem aqui os hábitos previstos para este dia.
            </p>
          </section>
        )}
      </section>
    </div>
  );
}

function pickTasks(tasks: Task[], limit: number) {
  const out: Task[] = [];
  let used = 0;
  for (const t of tasks) {
    if (used + t.minutes <= limit) {
      out.push(t);
      used += t.minutes;
    }
  }
  return out.length ? out : tasks.filter((t) => t.minutes <= limit).slice(0, 1);
}

function FreeTime({ ideas }: { ideas: Idea[] }) {
  return (
    <section className="card mb-5 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[#88919b]">
        Seu tempo está livre
      </div>
      <h2 className="mt-2 text-xl font-semibold">
        Quer fazer algo só porque gosta?
      </h2>
      <p className="mt-2 text-sm leading-5 text-[#7d8794]">
        Descansar também vale. Se quiser uma ideia, aqui vai uma das suas.
      </p>
      {ideas[0] && (
        <div className="mt-4 rounded-2xl bg-[#f8edcf] p-3 text-sm font-semibold">
          ✦ {ideas[0].title}
        </div>
      )}
    </section>
  );
}

function TaskRow({
  task,
  defs,
  toggle,
  edit,
}: {
  task: Task;
  defs: CategoryDef[];
  toggle: (id: string) => void;
  edit: (t: Task) => void;
}) {
  const actionable = task.kind === "task";
  const icon = task.kind === "birthday" ? "☆" : task.kind === "event" ? "□" : "";

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#e2ddd5] bg-white p-3">
      {actionable ? (
        <button
          onClick={() => toggle(task.id)}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${
            task.done ? "bg-[#24364b] text-white" : ""
          }`}
        >
          {task.done ? "✓" : ""}
        </button>
      ) : (
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f4efe8] text-xs font-bold">
          {icon}
        </span>
      )}
      <button onClick={() => edit(task)} className="min-w-0 flex-1 text-left">
        <div
          className={`truncate text-sm font-semibold ${
            actionable && task.done ? "line-through text-[#9aa1a8]" : ""
          }`}
        >
          {task.title}
        </div>
        <div className="mt-1 text-[11px] text-[#88919b]">
          {taskKindLabel(task.kind)} · {task.category}
          {task.start ? ` · ${timeRangeLabel(task)}` : ""}
          {!task.start && task.minutes > 0 ? ` · ${durationLabel(task.minutes)}` : ""}
          {task.steps.length ? ` · ${task.steps.filter((s) => s.done).length}/${task.steps.length} etapas` : ""}
        </div>
      </button>
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: catColor(defs, task.category) }}
      />
    </div>
  );
}

function PriorityDots({ p }: { p: Priority }) {
  const c =
    p === 3 ? "#d76c5d" : p === 2 ? "#d7a64c" : p === 1 ? "#6a9c7e" : "#c6c8ca";
  return (
    <div className="flex gap-1" title={`Prioridade ${p}`}>
      {[1, 2, 3].map((x) => (
        <span
          key={x}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: x <= p ? c : "#e3e0dc" }}
        />
      ))}
    </div>
  );
}

function CategoryChip({ c, defs }: { c: string; defs: CategoryDef[] }) {
  return (
    <span
      className="chip"
      style={{ background: catBg(defs, c), color: catColor(defs, c) }}
    >
      {c}
    </span>
  );
}

function CalendarView({
  state,
  toggleTask,
  edit,
  editHabit,
}: {
  state: AppState;
  toggleTask: (id: string) => void;
  edit: (t: Task) => void;
  editHabit: (h: Habit) => void;
}) {
  const [mode, setMode] = useState<"Mês" | "Semana" | "Agenda">("Mês");
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  return (
    <div>
      <SectionTitle title="Calendário" subtitle="Veja seu tempo com mais leveza antes de lotar o dia." />

      <div className="segment mb-4">
        {(["Mês", "Semana", "Agenda"] as const).map((m) => (
          <button
            key={m}
            className={mode === m ? "active" : ""}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <button
          className="rounded-xl border border-[#ddd7cf] bg-white px-3 py-2 text-sm"
          onClick={() => setCursor((d) => shiftCursor(d, mode, -1))}
        >
          ‹
        </button>
        <strong className="text-sm capitalize">{calendarLabel(cursor, mode)}</strong>
        <button
          className="rounded-xl border border-[#ddd7cf] bg-white px-3 py-2 text-sm"
          onClick={() => setCursor((d) => shiftCursor(d, mode, 1))}
        >
          ›
        </button>
      </div>

      {mode === "Mês" ? (
        <MonthGrid
          state={state}
          cursor={cursor}
          onSelectDate={setSelectedDay}
        />
      ) : mode === "Semana" ? (
        <WeekGrid state={state} cursor={cursor} edit={edit} editHabit={editHabit} />
      ) : (
        <Agenda
          state={state}
          cursor={cursor}
          toggle={toggleTask}
          edit={edit}
          editHabit={editHabit}
        />
      )}

      {selectedDay && (
        <DayDetailSheet
          state={state}
          date={selectedDay}
          toggle={toggleTask}
          edit={edit}
          editHabit={editHabit}
          close={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function shiftCursor(d: Date, mode: string, n: number) {
  const x = new Date(d);
  if (mode === "Mês") x.setMonth(x.getMonth() + n);
  else x.setDate(x.getDate() + n * (mode === "Semana" ? 7 : 1));
  return x;
}

function calendarLabel(d: Date, mode: string) {
  return mode === "Mês"
    ? new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
      }).format(d)
    : mode === "Semana"
    ? `Semana de ${fmtShort(iso(startOfWeek(d)))}`
    : new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(d);
}

function MonthGrid({
  state,
  cursor,
  onSelectDate,
}: {
  state: AppState;
  cursor: Date;
  onSelectDate: (date: string) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-bold uppercase text-[#9199a1]">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((x, i) => (
          <div key={i}>{x}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const ds = iso(d);
          const tasks = state.tasks.filter((t) => taskOccursOnDate(t, ds));
          const habits = state.habits.filter((h) => habitOccursOnDate(h, ds));
          const items = [
            ...tasks.map((t) => ({ type: "task" as const, item: t })),
            ...habits.map((h) => ({ type: "habit" as const, item: h })),
          ];
          const dim = d.getMonth() !== cursor.getMonth();

          return (
            <button
              key={ds}
              type="button"
              onClick={() => onSelectDate(ds)}
              className={`min-h-[70px] rounded-xl border p-1.5 text-left transition active:scale-[.98] ${
                ds === iso()
                  ? "border-[#24364b] bg-white"
                  : "border-[#e4dfd8] bg-[#fffefa]"
              } ${dim ? "opacity-35" : ""}`}
              aria-label={`Abrir ${new Intl.DateTimeFormat("pt-BR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(d)}`}
            >
              <div className="text-[10px] font-bold">{d.getDate()}</div>

              <div className="pointer-events-none mt-1 space-y-1">
                {items.slice(0, 4).map(({ type, item }) => (
                  <div
                    key={`${type}-${item.id}`}
                    className={`block h-1.5 w-full rounded-full ${
                      type === "habit" ? "opacity-60" : ""
                    }`}
                    style={{
                      background: catColor(state.categories, item.category),
                      opacity:
                        type === "task" && (item as Task).done ? 0.35 : undefined,
                    }}
                  />
                ))}

                {items.length > 4 && (
                  <div className="text-[8px] font-bold text-[#9299a0]">
                    +{items.length - 4}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayDetailSheet({
  state,
  date,
  toggle,
  edit,
  editHabit,
  close,
}: {
  state: AppState;
  date: string;
  toggle: (id: string) => void;
  edit: (t: Task) => void;
  editHabit: (h: Habit) => void;
  close: () => void;
}) {
  const d = new Date(`${date}T12:00:00`);

  const tasks = state.tasks.filter((t) => taskOccursOnDate(t, date));
  const habits = state.habits.filter((h) => habitOccursOnDate(h, date));

  const items = [
    ...tasks.map((t) => ({
      type: "task" as const,
      id: `task-${t.id}`,
      time: t.start || "",
      task: t,
    })),
    ...habits.map((h) => ({
      type: "habit" as const,
      id: `habit-${h.id}`,
      time: h.time || "",
      habit: h,
    })),
  ].sort((a, b) => timeSortValue(a.time) - timeSortValue(b.time));

  const timedItems = items.filter((item) => item.time);
  const untimedItems = items.filter((item) => !item.time);
  const total = items.length;

  const renderItem = (item: (typeof items)[number]) => {
    if (item.type === "task") {
      const t = item.task;

      return (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded-2xl border border-[#e7e0d8] bg-[#fffefa] p-3"
        >
          {t.kind === "task" ? (
            <button
              onClick={() => toggle(t.id)}
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs ${
                t.done
                  ? "border-[#24364b] bg-[#24364b] text-white"
                  : "border-[#d7d1c8] bg-white"
              }`}
              aria-label={t.done ? "Desmarcar tarefa" : "Concluir tarefa"}
            >
              {t.done ? "✓" : ""}
            </button>
          ) : (
            <span
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ background: catColor(state.categories, t.category) }}
            />
          )}

          <button
            onClick={() => {
              close();
              edit(t);
            }}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`truncate text-sm font-semibold ${
                  t.kind === "task" && t.done ? "text-[#8c949c] line-through" : ""
                }`}
              >
                {t.title}
              </span>

              {t.kind !== "task" && (
                <span className="rounded-full bg-[#f4efe8] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#7e8790]">
                  {t.kind === "event" ? "evento" : "aniversário"}
                </span>
              )}
            </div>

            <div className="mt-0.5 text-[10px] text-[#8c949c]">
              {timeRangeLabel(t)}
              {t.category ? ` · ${t.category}` : ""}
            </div>
          </button>
        </div>
      );
    }

    const h = item.habit;
    const current = h.logs[date] || 0;
    const quantitative =
      h.goal > 1 || h.unit.trim().toLowerCase() !== "vez";

    return (
      <button
        key={item.id}
        onClick={() => {
          close();
          editHabit(h);
        }}
        className="flex w-full items-center gap-3 rounded-2xl border border-[#dfe6dd] bg-[#f7f9f5] p-3 text-left"
      >
        <span
          className="h-8 w-1 shrink-0 rounded-full opacity-65"
          style={{ background: catColor(state.categories, h.category) }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{h.title}</span>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#7e8790]">
              hábito
            </span>
          </div>

          <div className="mt-0.5 text-[10px] text-[#8c949c]">
            {habitTimeRangeLabel(h)}
            {quantitative
              ? ` · ${current}/${h.goal} ${h.unit}`
              : current >= h.goal
              ? " · concluído"
              : ""}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8c949c]">
              Visão do dia
            </div>
            <h2 className="mt-1 text-xl font-semibold capitalize">
              {new Intl.DateTimeFormat("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(d)}
            </h2>
            <p className="mt-1 text-xs text-[#8c949c]">
              {total
                ? `${total} ${total === 1 ? "item" : "itens"} neste dia`
                : "Dia livre por enquanto ✨"}
            </p>
          </div>

          <button onClick={close} className="text-xl">
            ×
          </button>
        </div>

        {timedItems.length > 0 && (
          <div className="space-y-2">
            {timedItems.map(renderItem)}
          </div>
        )}

        {untimedItems.length > 0 && (
          <div className={timedItems.length ? "mt-5" : ""}>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#9aa0a6]">
              Sem horário
            </div>
            <div className="space-y-2">
              {untimedItems.map(renderItem)}
            </div>
          </div>
        )}

        {!total && (
          <div className="rounded-2xl bg-[#f6f2ec] px-4 py-6 text-center text-sm text-[#8c949c]">
            Nada marcado por enquanto. Pode ser descanso, respiro ou improviso bom.
          </div>
        )}
      </div>
    </div>
  );
}

function WeekGrid({
  state,
  cursor,
  edit,
  editHabit,
}: {
  state: AppState;
  cursor: Date;
  edit: (t: Task) => void;
  editHabit: (h: Habit) => void;
}) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  return (
    <div className="space-y-2">
      {days.map((d) => {
        const ds = iso(d);
        const tasks = state.tasks.filter((t) => taskOccursOnDate(t, ds));
        const habits = state.habits.filter((h) => habitOccursOnDate(h, ds));

        const items = [
          ...tasks.map((item) => ({
            type: "task" as const,
            item,
            time: item.start || "99:99",
            minutes: item.minutes || 0,
          })),
          ...habits.map((item) => ({
            type: "habit" as const,
            item,
            time: item.time || "99:99",
            minutes: item.minutes || 0,
          })),
        ].sort((a, b) => a.time.localeCompare(b.time));

        const occupiedMinutes = items.reduce((n, x) => n + x.minutes, 0);

        return (
          <section key={ds} className="card p-3">
            <div className="mb-2 flex items-center justify-between">
              <strong className="text-sm capitalize">
                {new Intl.DateTimeFormat("pt-BR", {
                  weekday: "short",
                  day: "2-digit",
                }).format(d)}
              </strong>
              <span className="text-[10px] text-[#8c949c]">
                {occupiedMinutes > 0 ? `${occupiedMinutes} min` : ""}
              </span>
            </div>

            {items.length ? (
              items.map(({ type, item }) => (
                <button
                  key={`${type}-${item.id}`}
                  onClick={() =>
                    type === "task"
                      ? edit(item as Task)
                      : editHabit(item as Habit)
                  }
                  className={`mb-1 flex w-full items-center gap-2 rounded-xl p-2 text-left ${
                    type === "habit" ? "bg-[#f4f6f2]" : "bg-[#f8f4ee]"
                  }`}
                >
                  <span
                    className={`h-7 w-1 rounded-full ${
                      type === "habit" ? "opacity-65" : ""
                    }`}
                    style={{ background: catColor(state.categories, item.category) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-xs font-semibold">{item.title}</div>
                      {type === "habit" && (
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#7e8790]">
                          hábito
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#8c949c]">
                      {type === "task"
                        ? timeRangeLabel(item as Task)
                        : habitTimeRangeLabel(item as Habit)}
                      {type === "habit" &&
                      !(item as Habit).time &&
                      (item as Habit).minutes
                        ? ` · ${durationLabel((item as Habit).minutes || 0)}`
                        : ""}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="py-2 text-xs text-[#a0a6ac]">Livre</div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Agenda({
  state,
  cursor,
  toggle,
  edit,
  editHabit,
}: {
  state: AppState;
  cursor: Date;
  toggle: (id: string) => void;
  edit: (t: Task) => void;
  editHabit: (h: Habit) => void;
}) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() + i);
    return d;
  });

  return (
    <div className="space-y-4">
      {days.map((d) => {
        const ds = iso(d);
        const tasks = state.tasks.filter((t) => taskOccursOnDate(t, ds));
        const habits = state.habits
          .filter((h) => habitOccursOnDate(h, ds))
          .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

        if (!tasks.length && !habits.length) return null;

        return (
          <div key={ds}>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#8c949c]">
              {new Intl.DateTimeFormat("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "short",
              }).format(d)}
            </div>

            <div className="space-y-2">
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  defs={state.categories}
                  toggle={toggle}
                  edit={edit}
                />
              ))}

              {habits.map((h) => {
                const current = h.logs[ds] || 0;
                const done = current >= h.goal;
                return (
                  <button
                    key={h.id}
                    onClick={() => editHabit(h)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[#e0e5dd] bg-[#f7f9f5] p-3 text-left"
                  >
                    <span
                      className="h-8 w-1 shrink-0 rounded-full opacity-65"
                      style={{ background: catColor(state.categories, h.category) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="truncate text-sm font-semibold">{h.title}</div>
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#7e8790]">
                          hábito
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#8c949c]">
                        {habitTimeRangeLabel(h)}
                        {h.goal > 1 || h.unit.trim().toLowerCase() !== "vez"
                          ? ` · ${current}/${h.goal} ${h.unit}`
                          : done
                          ? " · concluído"
                          : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HabitsView({
  state,
  setState,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editHabit, setEditHabit] = useState<Habit | null>(null);
  const today = iso();

  const log = (h: Habit, delta: number) =>
    setState((s) => ({
      ...s,
      habits: s.habits.map((x) =>
        x.id === h.id
          ? {
              ...x,
              logs: {
                ...x.logs,
                [today]: Math.max(0, (x.logs[today] || 0) + delta),
              },
            }
          : x
      ),
    }));

  const registerCustom = (h: Habit) => {
    const raw = window.prompt(`Quanto deseja registrar em ${h.unit}?`, "");
    if (!raw) return;
    const amount = Number(raw.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    log(h, amount);
  };

  const visible = state.habits.filter((h) => !h.archived);

  return (
    <div>
      <SectionTitle
        title="Hábitos"
        subtitle="Consistência gentil, sem cobrança exagerada."
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-xl bg-[#24364b] px-3 py-2 text-xs font-bold text-white"
          >
            + hábito
          </button>
        }
      />

      <div className="space-y-3">
        {visible.map((h) => {
          const val = h.logs[today] || 0;
          const pct = Math.min(100, (val / Math.max(h.goal, 1)) * 100);
          return (
            <section key={h.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <CategoryChip defs={state.categories} c={h.category} />
                  <button
                    onClick={() => setEditHabit(h)}
                    className="mt-3 block text-left"
                  >
                    <h3 className="text-base font-semibold">{h.title}</h3>
                    <p className="mt-1 text-xs text-[#87909a]">
                      {habitFrequencyLabel(h)} · Meta: {h.goal} {h.unit}
                    </p>
                    {(h.time || h.minutes) && (
                      <p className="mt-1 text-[11px] text-[#87909a]">
                        {h.time ? `${h.time}` : ""}
                        {h.time && h.minutes ? " · " : ""}
                        {h.minutes ? durationLabel(h.minutes) : ""}
                      </p>
                    )}
                  </button>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold">{val}</div>
                  <div className="text-[10px] text-[#87909a]">{h.unit}</div>
                </div>
              </div>

              <div className="mt-4 progressbar">
                <div
                  style={{
                    width: `${pct}%`,
                    background: catColor(state.categories, h.category),
                  }}
                />
              </div>

              <div className="mt-4">
                {h.goal > 1 || h.unit.trim().toLowerCase() !== "vez" ? (
                  <>
                    <div className="grid grid-cols-4 gap-1.5">
                      {habitQuickAmounts(h).map((amount) => (
                        <button
                          key={amount}
                          onClick={() => log(h, amount)}
                          className="rounded-xl border border-[#ddd7cf] bg-white py-2 text-[11px] font-bold"
                        >
                          +{amount}
                        </button>
                      ))}
                      <button
                        onClick={() => registerCustom(h)}
                        className="rounded-xl bg-[#24364b] py-2 text-[11px] font-bold text-white"
                      >
                        Outro
                      </button>
                    </div>
                    <button
                      onClick={() => log(h, -habitQuickAmounts(h)[0])}
                      className="mt-2 w-full rounded-xl border border-[#ddd7cf] py-2 text-[11px] font-bold text-[#68737e]"
                    >
                      Corrigir −{habitQuickAmounts(h)[0]} {h.unit}
                    </button>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => log(h, -1)}
                      className="flex-1 rounded-xl border border-[#ddd7cf] py-2 text-sm"
                    >
                      −
                    </button>
                    <button
                      onClick={() => log(h, 1)}
                      className="flex-1 rounded-xl bg-[#24364b] py-2 text-sm font-bold text-white"
                    >
                      + registrar
                    </button>
                  </div>
                )}
              </div>

              <MiniHabitHistory h={h} defs={state.categories} />
            </section>
          );
        })}
      </div>

      {!visible.length && (
        <section className="soft-card p-4 text-center">
          <div className="text-sm font-semibold">Seus hábitos começam aqui 🌱</div>
          <p className="mt-1 text-xs text-[#7e8790]">
            Crie algo simples, gostoso de manter e que combine com a tua rotina.
          </p>
        </section>
      )}

      {showAdd && (
        <HabitComposer
          state={state}
          close={() => setShowAdd(false)}
          save={(h) => {
            setState((s) => ({ ...s, habits: [...s.habits, h] }));
            setShowAdd(false);
          }}
        />
      )}

      {editHabit && (
        <HabitComposer
          state={state}
          habit={editHabit}
          close={() => setEditHabit(null)}
          save={(h) => {
            setState((s) => ({
              ...s,
              habits: s.habits.map((x) => (x.id === h.id ? h : x)),
            }));
            setEditHabit(null);
          }}
          remove={() => {
            setState((s) => ({
              ...s,
              habits: s.habits.filter((x) => x.id !== editHabit.id),
            }));
            setEditHabit(null);
          }}
        />
      )}
    </div>
  );
}

function habitFrequencyLabel(h: Habit) {
  if (h.frequency === "daily") return "Diariamente";
  if (h.frequency === "monthly") return "Mensal";
  if (h.frequency === "weekly" || h.frequency === "custom") {
    const names = WEEKDAYS.filter((d) => h.days.includes(d.n)).map((d) => d.label);
    return names.length ? names.join(", ") : "Dias personalizados";
  }
  return "Personalizado";
}

function MiniHabitHistory({
  h,
  defs,
}: {
  h: Habit;
  defs: CategoryDef[];
}) {
  const days = Array.from({ length: 7 }, (_, i) => offsetISO(i - 6));
  return (
    <div className="mt-4 flex justify-between">
      {days.map((d) => {
        const done = (h.logs[d] || 0) >= h.goal;
        return (
          <div key={d} className="text-center">
            <div
              className={`mx-auto h-5 w-5 rounded-full ${
                done ? "" : "border border-[#ddd7cf]"
              }`}
              style={done ? { background: catColor(defs, h.category) } : {}}
            />
            <div className="mt-1 text-[9px] text-[#969da4]">
              {new Intl.DateTimeFormat("pt-BR", { weekday: "narrow" }).format(
                new Date(`${d}T12:00:00`)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MoreHub({
  active,
  setActive,
  state,
  setState,
  toggleTask,
  edit,
  startFocus,
  convertIdea,
}: {
  active: MoreTab;
  setActive: (m: MoreTab) => void;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  toggleTask: (id: string) => void;
  edit: (t: Task) => void;
  startFocus: (t: Task) => void;
  convertIdea: (i: Idea) => void;
}) {
  const items: [MoreTab, string][] = [
    ["Ritmo", "〰️"],
    ["Tarefas", "✅"],
    ["Eisenhower", "🧭"],
    ["Foco", "🎯"],
    ["Contagens", "⏳"],
    ["Ideias", "💡"],
    ["Perfil", "🙂"],
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {items.map(([name, icon]) => (
          <button
            key={name}
            onClick={() => setActive(name)}
            className={`rounded-full px-3 py-2 text-xs font-bold transition ${
              active === name
                ? "bg-[#24364b] text-white shadow-sm"
                : "border border-[#ddd7cf] bg-white text-[#68737e]"
            }`}
          >
            {icon} {name}
          </button>
        ))}
      </div>

      {active === "Ritmo" && <Rhythm state={state} />}
      {active === "Tarefas" && (
        <TasksHub
          state={state}
          toggle={toggleTask}
          edit={edit}
        />
      )}
      {active === "Eisenhower" && (
        <Eisenhower state={state} edit={edit} />
      )}
      {active === "Foco" && (
        <FocusHub state={state} startFocus={startFocus} />
      )}
      {active === "Contagens" && (
        <Countdowns state={state} setState={setState} />
      )}
      {active === "Ideias" && (
        <Ideas
          state={state}
          setState={setState}
          convertIdea={convertIdea}
        />
      )}
      {active === "Perfil" && <Profile state={state} setState={setState} />}
    </div>
  );
}

function TasksHub({
  state,
  toggle,
  edit,
}: {
  state: AppState;
  toggle: (id: string) => void;
  edit: (t: Task) => void;
}) {
  const [view, setView] = useState<"Lista" | "Kanban" | "Etapas">("Lista");
  const [filter, setFilter] = useState("Todas");

  const filters = ["Todas", ...state.categories.map((c) => c.name)];
  const taskItems = state.tasks.filter((t) => t.kind === "task");
  const data =
    filter === "Todas"
      ? taskItems
      : taskItems.filter((t) => t.category === filter);

  return (
    <div>
      <SectionTitle
        title="Tarefas"
        subtitle="Organize por categoria, projeto, prioridade e etapas."
      />

      <div className="segment mb-3">
        {(["Lista", "Kanban", "Etapas"] as const).map((v) => (
          <button
            key={v}
            className={view === v ? "active" : ""}
            onClick={() => setView(v)}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
              filter === f
                ? "bg-[#24364b] text-white"
                : "border border-[#ddd7cf] bg-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {view === "Lista" ? (
        <div className="space-y-2">
          {[...data]
            .sort((a, b) => Number(a.done) - Number(b.done) || b.priority - a.priority)
            .map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                defs={state.categories}
                toggle={toggle}
                edit={edit}
              />
            ))}
        </div>
      ) : view === "Kanban" ? (
        <Kanban state={state} tasks={data} edit={edit} />
      ) : (
        <StepsView state={state} tasks={data} edit={edit} />
      )}
    </div>
  );
}

function Kanban({
  state,
  tasks,
  edit,
}: {
  state: AppState;
  tasks: Task[];
  edit: (t: Task) => void;
}) {
  const cols: [string, (t: Task) => boolean][] = [
    ["Hoje", (t) => t.date === iso() && !t.done],
    ["Próximas", (t) => t.date > iso() && !t.done],
    ["Concluídas", (t) => t.done],
  ];

  return (
    <div className="grid grid-cols-1 gap-3">
      {cols.map(([name, fn]) => (
        <section key={name} className="soft-card p-3">
          <div className="mb-2 text-xs font-bold">{name}</div>
          <div className="space-y-2">
            {tasks.filter(fn).map((t) => (
              <button
                key={t.id}
                onClick={() => edit(t)}
                className="block w-full rounded-xl bg-white p-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: catColor(state.categories, t.category) }}
                  />
                  <div className="text-sm font-semibold">{t.title}</div>
                </div>
                <div className="mt-1 text-[10px] text-[#8b939b]">
                  {t.category} · {fmtShort(t.date)}
                  {t.project ? ` · ${t.project}` : ""}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function StepsView({
  state,
  tasks,
  edit,
}: {
  state: AppState;
  tasks: Task[];
  edit: (t: Task) => void;
}) {
  const withSteps = tasks.filter((t) => t.steps.length > 0);

  if (!withSteps.length) {
    return (
      <section className="soft-card p-4 text-center">
        <div className="text-sm font-semibold">Nenhum processo por aqui ainda</div>
        <p className="mt-1 text-xs text-[#7e8790]">
          Quando uma tarefa tiver várias partes, use “+ Adicionar etapa” para organizar melhor.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      {withSteps.map((t) => {
        const done = t.steps.filter((s) => s.done).length;
        const pct = Math.round((done / t.steps.length) * 100);
        return (
          <section key={t.id} className="card p-4">
            <button onClick={() => edit(t)} className="block w-full text-left">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CategoryChip defs={state.categories} c={t.category} />
                  <h3 className="mt-3 text-base font-semibold">{t.title}</h3>
                  {t.project && (
                    <p className="mt-1 text-xs text-[#87909a]">{t.project}</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{pct}%</div>
                  <div className="text-[10px] text-[#87909a]">
                    {done}/{t.steps.length}
                  </div>
                </div>
              </div>

              <div className="mt-3 progressbar">
                <div
                  style={{
                    width: `${pct}%`,
                    background: catColor(state.categories, t.category),
                  }}
                />
              </div>

              <div className="mt-3 space-y-1">
                {t.steps.slice(0, 4).map((s) => (
                  <div
                    key={s.id}
                    className={`text-xs ${s.done ? "text-[#9aa1a8] line-through" : ""}`}
                  >
                    {s.done ? "✓" : "○"} {s.text}
                  </div>
                ))}
              </div>
            </button>
          </section>
        );
      })}
    </div>
  );
}

function Eisenhower({
  state,
  edit,
}: {
  state: AppState;
  edit: (t: Task) => void;
}) {
  const open = state.tasks.filter((t) => t.kind === "task" && !t.done);
  const boxes = [
    {
      title: "Fazer agora",
      sub: "Urgente + importante",
      bg: "#f6ded6",
      fn: (t: Task) => t.priority === 3 && t.date <= iso(),
    },
    {
      title: "Agendar",
      sub: "Importante",
      bg: "#e8eef8",
      fn: (t: Task) => t.priority >= 2 && t.date > iso(),
    },
    {
      title: "Resolver rápido",
      sub: "Urgente",
      bg: "#f8edcf",
      fn: (t: Task) => t.priority === 1 && t.date <= iso(),
    },
    {
      title: "Talvez depois",
      sub: "Baixa pressão",
      bg: "#e3efe8",
      fn: (t: Task) => t.priority <= 1 && t.date > iso(),
    },
  ];

  return (
    <div>
      <SectionTitle
        title="Matriz"
        subtitle="Prioridade sem transformar tudo em urgência dramática."
      />
      <div className="grid grid-cols-2 gap-2">
        {boxes.map((b) => (
          <section
            key={b.title}
            className="min-h-40 rounded-[20px] p-3"
            style={{ background: b.bg }}
          >
            <div className="text-xs font-bold">{b.title}</div>
            <div className="mt-1 text-[9px] text-[#7e8790]">{b.sub}</div>
            <div className="mt-3 space-y-2">
              {open
                .filter(b.fn)
                .slice(0, 4)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => edit(t)}
                    className="w-full rounded-xl bg-white/80 p-2 text-left text-[11px] font-semibold"
                  >
                    {t.title}
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function FocusHub({
  state,
  startFocus,
}: {
  state: AppState;
  startFocus: (t: Task) => void;
}) {
  const open = state.tasks.filter((t) => t.kind === "task" && !t.done).sort((a, b) => b.priority - a.priority);

  return (
    <div>
      <SectionTitle title="Foco" subtitle="Pomodoro ou duração real da tarefa." />

      <div className="soft-card mb-4 p-4 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[.14em] text-[#89919a]">
          Pomodoro rápido
        </div>
        <div className="mt-2 text-4xl font-semibold">25:00</div>
        <p className="mt-2 text-xs text-[#89919a]">
          Escolha uma tarefa abaixo para iniciar.
        </p>
      </div>

      <div className="space-y-2">
        {open.slice(0, 8).map((t) => (
          <button
            key={t.id}
            onClick={() => startFocus({ ...t, minutes: 25 })}
            className="card flex w-full items-center gap-3 p-3 text-left"
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-xl text-white"
              style={{ background: catColor(state.categories, t.category) }}
            >
              ▶
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{t.title}</span>
              <span className="text-[10px] text-[#8b939b]">
                {t.category} · 25 min
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Countdowns({
  state,
  setState,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(offsetISO(7));
  const [category, setCategory] = useState(firstCategory(state));

  return (
    <div>
      <SectionTitle
        title="Contagens"
        subtitle="Datas importantes para acompanhar sem pesar a cabeça."
      />

      <div className="grid grid-cols-2 gap-2">
        {state.countdowns.map((c) => {
          const days = Math.ceil(
            (new Date(`${c.date}T12:00:00`).getTime() -
              new Date(`${iso()}T12:00:00`).getTime()) /
              86400000
          );
          return (
            <section key={c.id} className="card p-4">
              <CategoryChip defs={state.categories} c={c.category} />
              <div className="mt-3 text-3xl font-semibold">{Math.max(days, 0)}</div>
              <div className="text-[10px] uppercase text-[#8c949c]">dias</div>
              <div className="mt-2 text-sm font-semibold">{c.title}</div>
              <button
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    countdowns: s.countdowns.filter((x) => x.id !== c.id),
                  }))
                }
                className="mt-3 text-[10px] text-[#a1685d]"
              >
                remover
              </button>
            </section>
          );
        })}
      </div>

      <section className="soft-card mt-4 p-4">
        <div className="text-sm font-semibold">Nova contagem</div>
        <input
          className="mt-3 w-full rounded-xl border border-[#ddd7cf] bg-white px-3 py-2 text-sm"
          placeholder="Ex.: viagem"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="date"
          className="mt-2 w-full rounded-xl border border-[#ddd7cf] bg-white px-3 py-2 text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <select
          className="mt-2 w-full rounded-xl border border-[#ddd7cf] bg-white px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {state.categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            if (!title.trim()) return;
            setState((s) => ({
              ...s,
              countdowns: [
                ...s.countdowns,
                { id: uid(), title: title.trim(), date, category },
              ],
            }));
            setTitle("");
          }}
          className="mt-3 w-full rounded-xl bg-[#24364b] py-2.5 text-xs font-bold text-white"
        >
          Adicionar
        </button>
      </section>
    </div>
  );
}

function Ideas({
  state,
  setState,
  convertIdea,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  convertIdea: (i: Idea) => void;
}) {
  const [editing, setEditing] = useState<Idea | null>(null);
  const [creating, setCreating] = useState(false);

  const removeIdea = (id: string) =>
    setState((s) => ({ ...s, ideas: s.ideas.filter((i) => i.id !== id) }));

  return (
    <div>
      <SectionTitle
        title="Ideias"
        subtitle="Aqui nada vence. Ideia ainda não é obrigação."
        action={
          <button
            onClick={() => setCreating(true)}
            className="rounded-xl bg-[#24364b] px-3 py-2 text-xs font-bold text-white"
          >
            + Nova ideia
          </button>
        }
      />

      {!state.ideas.length && (
        <section className="soft-card mb-4 p-4 text-center">
          <div className="text-sm font-semibold">Guarde uma ideia antes que ela fuja</div>
          <p className="mt-1 text-xs text-[#7e8790]">
            Ela pode descansar aqui sem pressão, até chegar a hora certa.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-3 rounded-xl border border-[#ddd7cf] px-3 py-2 text-xs font-bold"
          >
            + Adicionar ideia
          </button>
        </section>
      )}

      <div className="space-y-3">
        {state.ideas.map((i) => (
          <section key={i.id} className="card p-4">
            <CategoryChip defs={state.categories} c={i.category} />
            <h3 className="mt-3 text-base font-semibold">{i.title}</h3>
            {i.note && (
              <p className="mt-2 text-xs leading-5 text-[#7e8790]">{i.note}</p>
            )}
            {i.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {i.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[#f6f2ec] px-2 py-1 text-[10px] text-[#7e8790]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => convertIdea(i)}
                className="rounded-xl bg-[#24364b] px-3 py-2 text-xs font-bold text-white"
              >
                Transformar em tarefa
              </button>
              <button
                onClick={() => setEditing(i)}
                className="rounded-xl border border-[#ddd7cf] px-3 py-2 text-xs font-bold"
              >
                Editar
              </button>
            </div>

            <button
              onClick={() => removeIdea(i.id)}
              className="mt-3 text-[10px] font-bold text-[#a1685d]"
            >
              Excluir ideia
            </button>
          </section>
        ))}
      </div>

      {creating && (
        <IdeaComposer
          state={state}
          close={() => setCreating(false)}
          save={(idea) => {
            setState((s) => ({ ...s, ideas: [...s.ideas, idea] }));
            setCreating(false);
          }}
        />
      )}

      {editing && (
        <IdeaComposer
          state={state}
          idea={editing}
          close={() => setEditing(null)}
          save={(idea) => {
            setState((s) => ({
              ...s,
              ideas: s.ideas.map((x) => (x.id === idea.id ? idea : x)),
            }));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Rhythm({ state }: { state: AppState }) {
  const [period, setPeriod] = useState<"Semana" | "Mês" | "Ano">("Semana");
  const { start, end, prevStart, prevEnd } = periodRange(period);

  const done = state.tasks.filter((t) => t.kind === "task" && t.done && between(t.date, start, end));
  const prev = state.tasks.filter((t) => t.kind === "task" && t.done && between(t.date, prevStart, prevEnd));
  const total = done.reduce((n, t) => n + t.minutes, 0);

  const byCat = state.categories.map((cat) => ({
    c: cat.name,
    min: done
      .filter((t) => t.category === cat.name)
      .reduce((n, t) => n + t.minutes, 0),
  }));

  const max = Math.max(1, ...byCat.map((x) => x.min));
  const prevTotal = prev.reduce((n, t) => n + t.minutes, 0);
  const delta = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0;

  return (
    <div>
      <SectionTitle
        title="Seu ritmo"
        subtitle="Mais do que quantidade: onde sua atenção foi parar."
      />

      <div className="segment mb-4">
        {(["Semana", "Mês", "Ano"] as const).map((p) => (
          <button
            key={p}
            className={period === p ? "active" : ""}
            onClick={() => setPeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <section className="card mb-4 p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[.14em] text-[#89919a]">
              Tempo investido
            </div>
            <div className="mt-1 text-3xl font-semibold">
              {Math.floor(total / 60)}h {total % 60}m
            </div>
          </div>
          <div
            className={`text-xs font-bold ${
              delta >= 0 ? "text-[#5e9478]" : "text-[#b46d5d]"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {delta}% vs anterior
          </div>
        </div>
      </section>

      <section className="card mb-4 p-4">
        <div className="mb-4 text-sm font-semibold">Pulso das áreas</div>
        <div className="space-y-4">
          {byCat.map((x) => (
            <div key={x.c}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold">{x.c}</span>
                <span className="text-[#8b939b]">{x.min} min</span>
              </div>
              <div className="progressbar">
                <div
                  style={{
                    width: `${(x.min / max) * 100}%`,
                    background: catColor(state.categories, x.c),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <PeriodInsight period={period} state={state} tasks={done} />
    </div>
  );
}

function periodRange(p: "Semana" | "Mês" | "Ano") {
  const now = new Date();
  let start: Date, end: Date, prevStart: Date, prevEnd: Date;

  if (p === "Semana") {
    start = startOfWeek(now);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    prevStart = new Date(start);
    prevStart.setDate(start.getDate() - 7);
    prevEnd = new Date(start);
    prevEnd.setDate(start.getDate() - 1);
  } else if (p === "Mês") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear() - 1, 11, 31);
  }

  return { start, end, prevStart, prevEnd };
}

function PeriodInsight({
  period,
  state,
  tasks,
}: {
  period: string;
  state: AppState;
  tasks: Task[];
}) {
  const grouped = state.categories
    .map((cat) => ({
      c: cat.name,
      min: tasks
        .filter((t) => t.category === cat.name)
        .reduce((n, t) => n + t.minutes, 0),
    }))
    .sort((a, b) => b.min - a.min);

  const high = grouped[0];
  const low =
    [...grouped].reverse().find((x) => x.min > 0) || grouped[grouped.length - 1];

  const label =
    period === "Semana"
      ? "Leitura da semana"
      : period === "Mês"
      ? "Leitura do mês"
      : "Leitura do ano";

  return (
    <section className="soft-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-[.14em] text-[#89919a]">
        {label}
      </div>
      {tasks.length ? (
        <p className="mt-2 text-sm leading-5">
          Você colocou mais energia em <strong>{high?.c}</strong>.
          {low && high && low.c !== high.c ? (
            <>
              {" "}
              A área com menos presença foi <strong>{low.c}</strong>.
            </>
          ) : null}{" "}
          O objetivo não é deixar tudo igual, e sim perceber o padrão.
        </p>
      ) : (
        <p className="mt-2 text-sm text-[#7e8790]">
          Ainda não há tarefas concluídas neste período.
        </p>
      )}
    </section>
  );
}

function Profile({
  state,
  setState,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}) {
  const accents = ["#24364b", "#315f61", "#5d6f91", "#647b68", "#785f79"];
  const [permission, setPermission] = useState<string>("default");
  const [installable, setInstallable] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    if ("Notification" in window) setPermission(Notification.permission);
    setInstallable(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  const enableNotifications = async () => {
    try {
      await registerPushSubscription();
      setPermission("granted");
      alert("Notificações ativadas com sucesso!");
    } catch (error) {
      console.error("Erro ao ativar push:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível ativar as notificações.";
      alert(message);
    }
  };

  const testNotification = async () => {
    if (Notification.permission !== "granted") return enableNotifications();
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("Meu Ritmo", {
      body: "Notificações ativadas ✨ Este é um lembrete de teste.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "teste-meu-ritmo",
    });
  };

  const testServerPush = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("Usuário não encontrado.");
        return;
      }

      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (error || !data) {
        console.error(error);
        alert("Assinatura de push não encontrada.");
        return;
      }

      fetch("/api/push", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: {
            endpoint: data.endpoint,
            keys: {
              p256dh: data.p256dh,
              auth: data.auth,
            },
          },
          title: "Meu Ritmo",
          body: "Push com o app fechado funcionando ✨",
          delaySeconds: 10,
        }),
      }).catch((error) => {
        console.error("Erro ao solicitar push atrasado:", error);
      });

      alert("Push agendado para daqui a 10 segundos. Fecha a aba agora.");
    } catch (error) {
      console.error(error);
      alert("Erro ao testar push do servidor.");
    }
  };

  const renameCategory = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setState((s) => {
      const old = s.categories.find((c) => c.id === id);
      if (!old || old.name === trimmed) return s;
      if (s.categories.some((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())) {
        alert("Já existe uma categoria com esse nome.");
        return s;
      }
      return {
        ...s,
        categories: s.categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
        tasks: s.tasks.map((t) => (t.category === old.name ? { ...t, category: trimmed } : t)),
        habits: s.habits.map((h) => (h.category === old.name ? { ...h, category: trimmed } : h)),
        ideas: s.ideas.map((i) => (i.category === old.name ? { ...i, category: trimmed } : i)),
        countdowns: s.countdowns.map((c) => (c.category === old.name ? { ...c, category: trimmed } : c)),
      };
    });
  };

  const deleteCategory = (id: string) => {
    if (state.categories.length <= 1) {
      alert("Você precisa manter pelo menos uma categoria.");
      return;
    }
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return;
    const replacement = state.categories.find((c) => c.id !== id)?.name || "Pessoal";
    setState((s) => ({
      ...s,
      categories: s.categories.filter((c) => c.id !== id),
      tasks: s.tasks.map((t) => (t.category === cat.name ? { ...t, category: replacement } : t)),
      habits: s.habits.map((h) => (h.category === cat.name ? { ...h, category: replacement } : h)),
      ideas: s.ideas.map((i) => (i.category === cat.name ? { ...i, category: replacement } : i)),
      countdowns: s.countdowns.map((c) => (c.category === cat.name ? { ...c, category: replacement } : c)),
    }));
  };

  const moveCategory = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= state.categories.length) return;
    setState((s) => {
      const categories = [...s.categories];
      [categories[index], categories[target]] = [categories[target], categories[index]];
      return { ...s, categories };
    });
  };

  return (
    <div>
      <SectionTitle
        title="Perfil"
        subtitle="Ajustes simples. O app deve se adaptar a você."
      />

      <section className="card p-4">
        <label className="text-xs font-bold">Seu nome</label>
        <input
          value={state.userName}
          onChange={(e) =>
            setState((s) => ({ ...s, userName: e.target.value }))
          }
          className="mt-2 w-full rounded-xl border border-[#ddd7cf] px-3 py-2 text-sm"
        />

        <label className="mt-4 block text-xs font-bold">Nome do app</label>
        <input
          value={state.appName}
          onChange={(e) =>
            setState((s) => ({ ...s, appName: e.target.value }))
          }
          className="mt-2 w-full rounded-xl border border-[#ddd7cf] px-3 py-2 text-sm"
        />

        <div className="mt-4 text-xs font-bold">Cor principal</div>
        <div className="mt-2 flex gap-2">
          {accents.map((a) => (
            <button
              key={a}
              onClick={() => setState((s) => ({ ...s, accent: a }))}
              className={`h-9 w-9 rounded-full ${
                state.accent === a ? "ring-2 ring-offset-2 ring-[#24364b]" : ""
              }`}
              style={{ background: a }}
            />
          ))}
        </div>
      </section>

      <section className="card mt-4 p-4">
        <div className="text-sm font-semibold">Categorias</div>
        <p className="mt-1 text-xs leading-5 text-[#7e8790]">
          Renomeie, troque a cor, crie, exclua ou reorganize.
        </p>

        <div className="mt-3 space-y-2">
          {state.categories.map((c, index) => (
            <div
              key={c.id}
              className="rounded-2xl border border-[#e2ddd5] bg-white p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      categories: s.categories.map((x) =>
                        x.id === c.id ? { ...x, color: e.target.value } : x
                      ),
                    }))
                  }
                  className="h-9 w-10 rounded-lg border-0 bg-transparent"
                />
                <input
                  defaultValue={c.name}
                  onBlur={(e) => renameCategory(c.id, e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-[#ddd7cf] px-3 py-2 text-sm"
                />
                <button
                  onClick={() => moveCategory(index, -1)}
                  className="rounded-lg border border-[#ddd7cf] px-2 py-2 text-xs"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveCategory(index, 1)}
                  className="rounded-lg border border-[#ddd7cf] px-2 py-2 text-xs"
                >
                  ↓
                </button>
              </div>
              <button
                onClick={() => deleteCategory(c.id)}
                className="mt-2 text-[10px] font-bold text-[#a1685d]"
              >
                Excluir categoria
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Nova categoria"
            className="min-w-0 flex-1 rounded-xl border border-[#ddd7cf] px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              const name = newCategory.trim();
              if (!name) return;
              if (
                state.categories.some(
                  (c) => c.name.toLowerCase() === name.toLowerCase()
                )
              ) {
                alert("Já existe uma categoria com esse nome.");
                return;
              }
              setState((s) => ({
                ...s,
                categories: [
                  ...s.categories,
                  { id: uid(), name, color: "#7d8b99" },
                ],
              }));
              setNewCategory("");
            }}
            className="rounded-xl bg-[#24364b] px-4 py-2 text-xs font-bold text-white"
          >
            Criar
          </button>
        </div>
      </section>

      <section className="card mt-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Notificações</div>
            <p className="mt-1 text-xs leading-5 text-[#7e8790]">
              Receba lembretes das tarefas com horário.
            </p>
          </div>
          <span
            className={`chip ${
              permission === "granted"
                ? "bg-[#e3efe8] text-[#4d7c65]"
                : "bg-[#f6f2ec] text-[#7e8790]"
            }`}
          >
            {permission === "granted" ? "Ativas" : "Desligadas"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={enableNotifications}
            className="rounded-xl bg-[#24364b] px-3 py-2.5 text-xs font-bold text-white"
          >
            {permission === "granted" ? "Reautorizar" : "Ativar"}
          </button>
          <button
            onClick={testNotification}
            className="rounded-xl border border-[#ddd7cf] px-3 py-2.5 text-xs font-bold"
          >
            Testar
          </button>
        </div>

        <button
          onClick={testServerPush}
          className="mt-2 w-full rounded-xl border border-[#ddd7cf] px-3 py-2.5 text-xs font-bold"
        >
          Testar push do servidor
        </button>

        <p className="mt-3 text-[10px] leading-4 text-[#8b939b]">
          O push com o app totalmente fechado ainda está em teste.
        </p>
      </section>

      <section className="soft-card mt-4 p-4">
        <div className="text-sm font-semibold">Instalação</div>
        <p className="mt-2 text-xs leading-5 text-[#7e8790]">
          {installable
            ? "Você já está usando como app instalado."
            : "Android/Chrome: menu do navegador → Adicionar à tela inicial. iPhone/Safari: Compartilhar → Adicionar à Tela de Início."}
        </p>
      </section>

      <section className="soft-card mt-4 p-4">
        <div className="text-sm font-semibold">Sobre seus dados</div>
        <p className="mt-2 text-xs leading-5 text-[#7e8790]">
          Seus dados são sincronizados com sua conta e também ficam salvos localmente neste aparelho.
        </p>
        <button
          onClick={() => {
            localStorage.removeItem("meu-ritmo-v2.3");
            location.reload();
          }}
          className="mt-4 text-xs font-bold text-[#a1685d]"
        >
          Limpar todos os dados
        </button>
      </section>
    </div>
  );
}

function TaskComposer({
  state,
  task,
  initial,
  close,
  save,
  remove,
}: {
  state: AppState;
  task?: Task;
  initial?: Partial<Task>;
  close: () => void;
  save: (t: Task) => void;
  remove?: () => void;
}) {
  const base = task || initial;

  const [kind, setKind] = useState<TaskKind>(base?.kind || "task");
  const [title, setTitle] = useState(base?.title || "");
  const [notes, setNotes] = useState(base?.notes || "");
  const [date, setDate] = useState(base?.date || iso());
  const [start, setStart] = useState(base?.start || "");
  const [category, setCategory] = useState(base?.category || firstCategory(state));
  const [priority, setPriority] = useState<Priority>(base?.priority ?? 1);
  const [project, setProject] = useState(base?.project || "");
  const [tags, setTags] = useState(base?.tags?.join(", ") || "");
  const [recurring, setRecurring] = useState<Recurrence>(base?.recurring || "none");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(
    base?.recurrenceDays || []
  );
  const [recurrenceEnd, setRecurrenceEnd] = useState(base?.recurrenceEnd || "");
  const [reminder, setReminder] = useState(base?.reminder || "none");
  const [steps, setSteps] = useState<Step[]>(base?.steps || []);
  const [step, setStep] = useState("");
  const [moreOptions, setMoreOptions] = useState(
    Boolean(
      project ||
        tags ||
        recurring !== "none" ||
        recurrenceDays.length ||
        recurrenceEnd ||
        reminder !== "none" ||
        steps.length ||
        notes
    )
  );

  const initialMinutes = base?.minutes || 0;
  const initialDurationUnit = initialMinutes >= 60 && initialMinutes % 60 === 0 ? "h" : "min";
  const [durationUnit, setDurationUnit] = useState<"min" | "h">(initialDurationUnit);
  const [durationValue, setDurationValue] = useState<number>(
    initialMinutes
      ? initialDurationUnit === "h"
        ? initialMinutes / 60
        : initialMinutes
      : 0
  );

  const minutes =
    Number(durationValue) <= 0
      ? 0
      : durationUnit === "h"
      ? Math.max(1, Math.round(Number(durationValue) * 60))
      : Math.max(1, Math.round(Number(durationValue)));

  const toggleDay = (n: number) =>
    setRecurrenceDays((days) =>
      days.includes(n) ? days.filter((d) => d !== n) : [...days, n].sort()
    );

  const submit = () => {
    if (!title.trim()) return;

    save({
      id: task?.id || uid(),
      kind,
      title: title.trim(),
      notes,
      date,
      start: start || undefined,
      minutes: kind === "birthday" ? 0 : minutes,
      category,
      priority: kind === "task" ? priority : 0,
      done: kind === "task" ? task?.done || false : false,
      tags: tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      project: project.trim() || undefined,
      recurring: kind === "birthday" ? "yearly" : recurring,
      recurrenceDays,
      recurrenceEnd: recurrenceEnd || undefined,
      reminder,
      steps,
    });
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet">
        <div className="mb-4 flex items-center justify-between">
          <strong>{task ? `Editar ${taskKindLabel(kind).toLowerCase()}` : `Novo ${taskKindLabel(kind).toLowerCase()}`}</strong>
          <button onClick={close} className="text-xl">
            ×
          </button>
        </div>

        {initial && !task && initial?.notes && (
          <div className="mb-3 rounded-xl bg-[#f6f2ec] px-3 py-2 text-[11px] text-[#6f7882]">
            Criando tarefa a partir de uma ideia
          </div>
        )}

        <div className="segment mb-4">
          {([
            ["task", "Tarefa"],
            ["event", "Evento"],
            ["birthday", "Aniversário"],
          ] as [TaskKind, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={kind === value ? "active" : ""}
              onClick={() => {
                setKind(value);
                if (value === "birthday") setRecurring("yearly");
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#8b939b]">
          <span>{kind === "birthday" ? "Nome da pessoa" : kind === "event" ? "Nome do evento" : "Nome da tarefa"}</span>
          <span className="text-[#6f7f92]">Obrigatório</span>
        </div>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "birthday" ? "Ex.: Aniversário da Emily" : kind === "event" ? "Ex.: Vôlei" : "O que precisa ser feito?"}
          className="w-full rounded-2xl border border-[#ddd7cf] px-4 py-3 text-base font-semibold"
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Data" required>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-transparent text-sm"
            />
          </Field>

          <Field label="Horário">
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full bg-transparent text-sm"
            />
          </Field>
        </div>

        {kind !== "birthday" && (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-bold">Duração</div>
            <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[#a1a7ad]">Opcional</div>
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <input
              type="number"
              min="0"
              step={durationUnit === "h" ? "0.5" : "5"}
              value={durationValue}
              onChange={(e) =>
                setDurationValue(e.target.value === "" ? 0 : Number(e.target.value))
              }
              className="w-full rounded-xl border border-[#ddd7cf] bg-white px-3 py-2 text-sm"
            />
            <select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as "min" | "h")}
              className="w-full rounded-xl border border-[#ddd7cf] bg-white px-3 py-2 text-sm"
            >
              <option value="min">minutos</option>
              <option value="h">horas</option>
            </select>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[
              { label: "15 min", m: 15 },
              { label: "30 min", m: 30 },
              { label: "1h", m: 60 },
              { label: "2h", m: 120 },
            ].map((x) => (
              <button
                key={x.m}
                onClick={() => {
                  if (x.m >= 60) {
                    setDurationUnit("h");
                    setDurationValue(x.m / 60);
                  } else {
                    setDurationUnit("min");
                    setDurationValue(x.m);
                  }
                }}
                className="rounded-xl border border-[#ddd7cf] bg-white px-2 py-2 text-[11px] font-bold"
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>        )}

        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-bold">Categoria</div>
            <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[#6f7f92]">Obrigatório</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.name)}
                className={`chip ${
                  category === c.name ? "ring-2 ring-[#24364b]/40" : ""
                }`}
                style={{ background: `${c.color}20`, color: c.color }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <Field label="Prioridade">
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) as Priority)}
            className="w-full bg-transparent text-sm"
          >
            <option value={0}>Nenhuma</option>
            <option value={1}>Baixa</option>
            <option value={2}>Média</option>
            <option value={3}>Alta</option>
          </select>
        </Field>

        <button
          onClick={() => setMoreOptions((v) => !v)}
          className="mt-3 w-full rounded-xl border border-[#ddd7cf] bg-[#fffdf9] px-3 py-2.5 text-xs font-bold"
        >
          {moreOptions ? "− Menos opções" : "+ Mais opções"}
        </button>

        {moreOptions && (
          <>
            <Field label="Projeto">
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="Ex.: Organização da viagem"
                className="w-full bg-transparent text-sm"
              />
            </Field>

            <Field label="Lembrete">
              <select
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
                className="w-full bg-transparent text-sm"
              >
                <option value="none">Sem lembrete</option>
                <option value="0">Na hora</option>
                <option value="5">5 min antes</option>
                <option value="15">15 min antes</option>
                <option value="30">30 min antes</option>
                <option value="60">1h antes</option>
              </select>
            </Field>

            <Field label="Repetir">
              <select
                value={recurring}
                onChange={(e) => setRecurring(e.target.value as Recurrence)}
                className="w-full bg-transparent text-sm"
              >
                <option value="none">Não repetir</option>
                <option value="daily">Diariamente</option>
                <option value="weekly">Semanalmente</option>
                <option value="monthly">Mensalmente</option>
                <option value="yearly">Anualmente</option>
                <option value="custom">Personalizado</option>
              </select>
            </Field>

            {(recurring === "weekly" || recurring === "custom") && (
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-bold">Dias</div>
                  <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[#6f7f92]">Obrigatório</div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.n}
                      onClick={() => toggleDay(d.n)}
                      className={`rounded-xl py-2 text-[10px] font-bold ${
                        recurrenceDays.includes(d.n)
                          ? "bg-[#24364b] text-white"
                          : "border border-[#ddd7cf] bg-white"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recurring !== "none" && (
              <Field label="Repetir até (opcional)">
                <input
                  type="date"
                  value={recurrenceEnd}
                  onChange={(e) => setRecurrenceEnd(e.target.value)}
                  className="w-full bg-transparent text-sm"
                />
              </Field>
            )}

            <Field label="Tags">
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="trabalho, rápida"
                className="w-full bg-transparent text-sm"
              />
            </Field>

            <Field label="Notas">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações, contexto, links..."
                className="min-h-20 w-full resize-none bg-transparent text-sm"
              />
            </Field>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-xs font-bold">Etapas / Processo</div>
                <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[#a1a7ad]">Opcional</div>
              </div>
              <p className="mb-2 text-[10px] text-[#8b939b]">
                Opcional. Use quando a tarefa tiver vários passos.
              </p>

              {steps.map((s) => (
                <div
                  key={s.id}
                  className="mb-1 flex items-center gap-2 rounded-xl bg-[#f6f2ec] px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={s.done}
                    onChange={() =>
                      setSteps((x) =>
                        x.map((y) =>
                          y.id === s.id ? { ...y, done: !y.done } : y
                        )
                      )
                    }
                  />
                  <span className="flex-1">{s.text}</span>
                  <button
                    onClick={() =>
                      setSteps((x) => x.filter((y) => y.id !== s.id))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}

              {!!steps.length && (
                <div className="mb-2 text-[10px] text-[#8b939b]">
                  {steps.filter((s) => s.done).length} de {steps.length} etapas concluídas
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={step}
                  onChange={(e) => setStep(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && step.trim()) {
                      e.preventDefault();
                      setSteps((x) => [
                        ...x,
                        { id: uid(), text: step.trim(), done: false },
                      ]);
                      setStep("");
                    }
                  }}
                  placeholder="Adicionar etapa"
                  className="flex-1 rounded-xl border border-[#ddd7cf] px-3 py-2 text-xs"
                />
                <button
                  onClick={() => {
                    if (step.trim()) {
                      setSteps((x) => [
                        ...x,
                        { id: uid(), text: step.trim(), done: false },
                      ]);
                      setStep("");
                    }
                  }}
                  className="rounded-xl border border-[#ddd7cf] px-3 text-xs font-bold"
                >
                  +
                </button>
              </div>
            </div>
          </>
        )}

        <div className="mt-5 flex gap-2">
          {remove && (
            <button
              onClick={remove}
              className="rounded-xl border border-[#e8cfc8] px-4 py-3 text-xs font-bold text-[#a1685d]"
            >
              Excluir
            </button>
          )}
          <button
            onClick={submit}
            className="flex-1 rounded-xl bg-[#24364b] py-3 text-xs font-bold text-white"
          >
            Salvar {taskKindLabel(kind).toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

function HabitComposer({
  state,
  habit,
  close,
  save,
  remove,
}: {
  state: AppState;
  habit?: Habit;
  close: () => void;
  save: (h: Habit) => void;
  remove?: () => void;
}) {
  const [title, setTitle] = useState(habit?.title || "");
  const [category, setCategory] = useState(habit?.category || firstCategory(state));
  const [frequency, setFrequency] = useState<HabitFrequency>(
    habit?.frequency || "daily"
  );
  const [days, setDays] = useState<number[]>(
    habit?.days || [0, 1, 2, 3, 4, 5, 6]
  );
  const [goal, setGoal] = useState(habit?.goal || 1);
  const [unit, setUnit] = useState(habit?.unit || "vez");
  const [time, setTime] = useState(habit?.time || "");
  const [period, setPeriod] = useState<DayPeriod>(habit?.period || "Outro");
  const [startDate, setStartDate] = useState(habit?.startDate || iso());
  const [endDate, setEndDate] = useState(habit?.endDate || "");
  const [reminder, setReminder] = useState(habit?.reminder || "none");
  const [archived, setArchived] = useState(habit?.archived || false);

  const initialMinutes = habit?.minutes || 0;
  const initialDurationUnit = initialMinutes >= 60 && initialMinutes % 60 === 0 ? "h" : "min";
  const [durationUnit, setDurationUnit] = useState<"min" | "h">(initialDurationUnit);
  const [durationValue, setDurationValue] = useState(
    initialDurationUnit === "h" ? initialMinutes / 60 : initialMinutes
  );

  const minutes =
    Number(durationValue) <= 0
      ? 0
      : durationUnit === "h"
      ? Math.max(1, Math.round(Number(durationValue) * 60))
      : Math.max(1, Math.round(Number(durationValue)));

  const toggleDay = (n: number) =>
    setDays((x) =>
      x.includes(n) ? x.filter((d) => d !== n) : [...x, n].sort()
    );

  const submit = () => {
    if (!title.trim()) return;
    save({
      id: habit?.id || uid(),
      title: title.trim(),
      category,
      frequency,
      days:
        frequency === "daily"
          ? [0, 1, 2, 3, 4, 5, 6]
          : days,
      goal: Math.max(1, goal),
      unit: unit.trim() || "vez",
      logs: habit?.logs || {},
      time: time || undefined,
      minutes: minutes || undefined,
      period,
      startDate,
      endDate: endDate || undefined,
      reminder,
      archived,
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="sheet">
        <div className="mb-4 flex justify-between">
          <strong>{habit ? "Editar hábito" : "Novo hábito"}</strong>
          <button onClick={close}>×</button>
        </div>

        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#8b939b]">
          <span>Nome do hábito</span>
          <span className="text-[#6f7f92]">Obrigatório</span>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Aula de teclado"
          className="w-full rounded-xl border border-[#ddd7cf] px-3 py-3"
        />

        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-bold">Categoria</div>
            <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[#6f7f92]">Obrigatório</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.name)}
                className={`chip ${
                  category === c.name ? "ring-2 ring-[#24364b]/40" : ""
                }`}
                style={{ background: `${c.color}20`, color: c.color }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <Field label="Frequência" required>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
            className="w-full bg-transparent text-sm"
          >
            <option value="daily">Diariamente</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensal</option>
            <option value="custom">Personalizada</option>
          </select>
        </Field>

        {(frequency === "weekly" || frequency === "custom") && (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-bold">Selecione os dias</div>
              <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[#6f7f92]">Obrigatório</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.n}
                  onClick={() => toggleDay(d.n)}
                  className={`rounded-xl py-2 text-[10px] font-bold ${
                    days.includes(d.n)
                      ? "bg-[#24364b] text-white"
                      : "border border-[#ddd7cf] bg-white"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Objetivo" required>
            <input
              type="number"
              min="1"
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
              className="w-full bg-transparent text-sm"
            />
          </Field>
          <Field label="Unidade" required>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="vez, copos, km"
              className="w-full bg-transparent text-sm"
            />
          </Field>
        </div>

        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-bold">Duração</div>
            <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[#a1a7ad]">Opcional</div>
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <input
              type="number"
              min="0"
              step={durationUnit === "h" ? "0.5" : "5"}
              value={durationValue}
              onChange={(e) => setDurationValue(Number(e.target.value))}
              className="w-full rounded-xl border border-[#ddd7cf] bg-white px-3 py-2 text-sm"
            />
            <select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as "min" | "h")}
              className="w-full rounded-xl border border-[#ddd7cf] bg-white px-3 py-2 text-sm"
            >
              <option value="min">minutos</option>
              <option value="h">horas</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Data de início" required>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-transparent text-sm"
            />
          </Field>
          <Field label="Data final">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-transparent text-sm"
            />
          </Field>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Período">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as DayPeriod)}
              className="w-full bg-transparent text-sm"
            >
              <option>Manhã</option>
              <option>Tarde</option>
              <option>Noite</option>
              <option>Outro</option>
            </select>
          </Field>
          <Field label="Horário">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-transparent text-sm"
            />
          </Field>
        </div>

        <Field label="Lembrete">
          <select
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
            className="w-full bg-transparent text-sm"
          >
            <option value="none">Sem lembrete</option>
            <option value="0">Na hora</option>
            <option value="5">5 min antes</option>
            <option value="15">15 min antes</option>
            <option value="30">30 min antes</option>
            <option value="60">1h antes</option>
          </select>
        </Field>

        {habit && (
          <label className="mt-3 flex items-center justify-between rounded-xl border border-[#ddd7cf] bg-white px-3 py-3 text-xs font-bold">
            Hábito arquivado
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
          </label>
        )}

        <div className="mt-5 flex gap-2">
          {remove && (
            <button
              onClick={remove}
              className="rounded-xl border border-[#e8cfc8] px-4 py-3 text-xs font-bold text-[#a1685d]"
            >
              Excluir
            </button>
          )}
          <button
            onClick={submit}
            className="flex-1 rounded-xl bg-[#24364b] py-3 text-xs font-bold text-white"
          >
            Salvar hábito
          </button>
        </div>
      </div>
    </div>
  );
}

function IdeaComposer({
  state,
  idea,
  close,
  save,
}: {
  state: AppState;
  idea?: Idea;
  close: () => void;
  save: (i: Idea) => void;
}) {
  const [title, setTitle] = useState(idea?.title || "");
  const [note, setNote] = useState(idea?.note || "");
  const [category, setCategory] = useState(idea?.category || firstCategory(state));
  const [tags, setTags] = useState(idea?.tags?.join(", ") || "");

  return (
    <div className="modal-backdrop">
      <div className="sheet">
        <div className="flex justify-between">
          <strong>{idea ? "Editar ideia" : "Nova ideia"}</strong>
          <button onClick={close}>×</button>
        </div>

        <div className="mt-4 mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#8b939b]">
          <span>Título da ideia</span>
          <span className="text-[#6f7f92]">Obrigatório</span>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Qual é a ideia?"
          className="w-full rounded-xl border border-[#ddd7cf] px-3 py-3"
        />

        <div className="mt-3 mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#8b939b]">
          <span>Observação</span>
          <span className="text-[#a1a7ad]">Opcional</span>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anotações livres..."
          className="min-h-24 w-full rounded-xl border border-[#ddd7cf] px-3 py-3 text-sm"
        />

        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-bold">Categoria</div>
            <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[#6f7f92]">Obrigatório</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {state.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.name)}
                className={`chip ${
                  category === c.name ? "ring-2 ring-[#24364b]/40" : ""
                }`}
                style={{ background: `${c.color}20`, color: c.color }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <Field label="Tags">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="produto, conteúdo"
            className="w-full bg-transparent text-sm"
          />
        </Field>

        <button
          onClick={() => {
            if (!title.trim()) return;
            save({
              id: idea?.id || uid(),
              title: title.trim(),
              note,
              category,
              tags: tags
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            });
          }}
          className="mt-5 w-full rounded-xl bg-[#24364b] py-3 text-xs font-bold text-white"
        >
          Salvar ideia
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mt-2 block rounded-xl border border-[#ddd7cf] bg-white px-3 py-2">
      <span className="mb-1 flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#8b939b]">
        <span>{label}</span>
        <span className={required ? "text-[#6f7f92]" : "text-[#a1a7ad]"}>
          {required ? "Obrigatório" : "Opcional"}
        </span>
      </span>
      {children}
    </label>
  );
}

function FocusSheet({
  task,
  state,
  secs,
  running,
  toggle,
  close,
  finish,
}: {
  task: Task;
  state: AppState;
  secs: number;
  running: boolean;
  toggle: () => void;
  close: () => void;
  finish: () => void;
}) {
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div className="modal-backdrop">
      <div className="sheet text-center">
        <button onClick={close} className="float-right text-xl">
          ×
        </button>
        <CategoryChip defs={state.categories} c={task.category} />
        <h2 className="mt-4 text-xl font-semibold">{task.title}</h2>
        <div className="my-8 text-6xl font-semibold tracking-tight">
          {mm}:{ss}
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggle}
            className="flex-1 rounded-xl border border-[#ddd7cf] py-3 text-sm font-bold"
          >
            {running ? "Pausar" : "Continuar"}
          </button>
          <button
            onClick={finish}
            className="flex-1 rounded-xl bg-[#24364b] py-3 text-sm font-bold text-white"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}

const titleEmoji: Record<string, string> = {
  "Calendário": "🗓️",
  "Hábitos": "🌱",
  "Ritmo": "〰️",
  "Tarefas": "✅",
  "Matriz": "🧭",
  "Foco": "🎯",
  "Contagens": "⏳",
  "Ideias": "💡",
  "Perfil": "🙂",
};

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  const emoji = titleEmoji[title];

  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#8a93a0] shadow-sm ring-1 ring-[#ece3d7]">
          <span>{emoji || "✦"}</span>
          <span>{title}</span>
        </div>
        <h1 className="text-[26px] font-semibold tracking-tight text-[#22364a]">
          {emoji ? `${emoji} ${title}` : title}
        </h1>
        <p className="mt-1 text-xs leading-5 text-[#7e8790]">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
