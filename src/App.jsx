import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

/** RWD: 判斷窄螢幕（手機） */
function useIsNarrow(breakpoint = 780) {
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isNarrow;
}

export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topRow}>
          <div>
            <div style={styles.h1}>Accounting</div>
            <div style={styles.hint}>Web · Supabase Sync</div>
          </div>

          {session && (
            <button style={styles.btnGhost} onClick={() => supabase.auth.signOut()}>
              登出
            </button>
          )}
        </div>

        {!session ? <Auth /> : <Ledger email={session.user.email} />}
      </div>
    </div>
  );
}

function Auth() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  const signUp = async () => {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password: pw });
    setMsg(error ? `註冊失敗：${error.message}` : "註冊成功，請直接登入");
  };

  const signIn = async () => {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setMsg(error ? `登入失敗：${error.message}` : "登入成功");
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>登入 / 註冊</div>
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <input style={styles.input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          style={styles.input}
          placeholder="Password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button style={styles.btn} onClick={signIn}>
            登入
          </button>
          <button style={styles.btnGhost} onClick={signUp}>
            註冊
          </button>
        </div>
        {msg && <div style={styles.hint}>{msg}</div>}
      </div>
    </div>
  );
}

function Ledger({ email }) {
  const isNarrow = useIsNarrow(780);

  // data
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState(["餐飲", "交通", "日用品", "娛樂", "房租", "薪資", "其他"]);

  // filter (year / month can be independent)
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear)); // "全部" or "2026"
  const [month, setMonth] = useState("全部"); // "全部" or "1".."12"

  // budget
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetResolved, setBudgetResolved] = useState(0);

  // form
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("支出");
  const [category, setCategory] = useState("餐飲");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const years = useMemo(() => {
    const list = ["全部"];
    for (let y = thisYear - 5; y <= thisYear + 5; y++) list.push(String(y));
    return list;
  }, [thisYear]);

  const months = useMemo(() => ["全部", ...Array.from({ length: 12 }, (_, i) => String(i + 1))], []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const d = new Date(r.date + "T00:00:00");
      const yOk = year === "全部" ? true : d.getFullYear() === Number(year);
      const mOk = month === "全部" ? true : d.getMonth() + 1 === Number(month);
      return yOk && mOk;
    });
  }, [rows, year, month]);

  const summary = useMemo(() => {
    const income = filtered.filter((r) => r.type === "收入").reduce((a, b) => a + Number(b.amount), 0);
    const expense = filtered.filter((r) => r.type === "支出").reduce((a, b) => a + Number(b.amount), 0);
    return { income, expense, balance: income - expense };
  }, [filtered]);

  const budgetRatio = useMemo(() => {
    if (!budgetResolved || budgetResolved <= 0) return 0;
    return Math.min(1, summary.expense / budgetResolved);
  }, [summary.expense, budgetResolved]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    loadBudgetForRange();
    // eslint-disable-next-line
  }, [year, month]);

  const rangeKey = () => {
    const y = year === "全部" ? null : Number(year);
    const m = month === "全部" ? null : Number(month);
    return { y, m };
  };

  const loadAll = async () => {
    const c = await supabase.from("categories").select("name").order("created_at", { ascending: true });
    if (!c.error && c.data?.length) {
      const list = c.data.map((x) => x.name);
      setCategories(list);
      if (!list.includes(category)) setCategory(list[0] || "其他");
    }

    const t = await supabase.from("transactions").select("*").order("date", { ascending: false }).limit(800);
    if (!t.error) setRows(t.data || []);

    await loadBudgetForRange();
  };

  const loadBudgetForRange = async () => {
    const { y, m } = rangeKey();

    const b = await supabase.from("budgets").select("*");
    if (b.error) {
      setBudgetResolved(0);
      setBudgetInput("");
      return;
    }

    const list = b.data || [];
    const pick = (yy, mm) => list.find((x) => (x.year ?? null) === yy && (x.month ?? null) === mm);

    const chosen = pick(y, m) || pick(y, null) || pick(null, m) || pick(null, null);
    const amt = chosen ? Number(chosen.amount) : 0;
    setBudgetResolved(amt);
    setBudgetInput(amt ? String(Math.trunc(amt)) : "");
  };

  const saveBudget = async () => {
    const raw = Number(String(budgetInput).replaceAll(",", ""));
    if (!Number.isFinite(raw) || raw < 0) return alert("預算金額不正確");

    const { data: u } = await supabase.auth.getUser();
    const user_id = u.user?.id;
    if (!user_id) return alert("尚未登入");

    const { y, m } = rangeKey();

    // 找同一個 user + 同一個 (year, month) 的 budget
    // .is() 只能用在 null；非 null 用 .eq()
    let q = supabase.from("budgets").select("id").eq("user_id", user_id);
    q = y === null ? q.is("year", null) : q.eq("year", y);
    q = m === null ? q.is("month", null) : q.eq("month", m);

    const existing = await q.maybeSingle();

    if (existing.error && existing.status !== 406) {
      return alert(existing.error.message);
    }

    if (existing.data?.id) {
      const up = await supabase.from("budgets").update({ amount: raw }).eq("id", existing.data.id);
      if (up.error) return alert(up.error.message);
    } else {
      const ins = await supabase.from("budgets").insert({ user_id, year: y, month: m, amount: raw });
      if (ins.error) return alert(ins.error.message);
    }

    await loadBudgetForRange();
    alert("預算已儲存");
  };

  const addTx = async () => {
    const amt = Number(String(amount).replaceAll(",", ""));
    if (!Number.isFinite(amt) || amt < 0) return alert("金額不正確");

    const { data: u } = await supabase.auth.getUser();
    const user_id = u.user?.id;
    if (!user_id) return alert("尚未登入");

    const insert = await supabase.from("transactions").insert({
      user_id,
      date,
      type,
      category,
      amount: amt,
      note,
    });

    if (insert.error) return alert(insert.error.message);

    setAmount("");
    setNote("");
    await loadAll();
  };

  const addCategory = async () => {
    const name = prompt("輸入新分類：");
    if (!name) return;

    const { data: u } = await supabase.auth.getUser();
    const user_id = u.user?.id;
    if (!user_id) return alert("尚未登入");

    const res = await supabase.from("categories").insert({ user_id, name });
    if (res.error) return alert(res.error.message);

    await loadAll();
  };

  const delTx = async (id) => {
    const res = await supabase.from("transactions").delete().eq("id", id);
    if (res.error) return alert(res.error.message);
    await loadAll();
  };

  const filterLabel = `${year === "全部" ? "全部年份" : year} / ${month === "全部" ? "全部月份" : `${month}月`}`;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={styles.hint}>登入：{email}</div>

      {/* ===== 統計 ===== */}
      <div style={styles.card}>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: isNarrow ? "1fr" : "repeat(12, minmax(0, 1fr))",
            alignItems: "end",
          }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={styles.cardTitle}>統計</div>
          </div>

          <label style={{ gridColumn: isNarrow ? "1 / -1" : "span 4" }}>
            <div style={styles.label}>年份</div>
            <select style={styles.select} value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y === "全部" ? "全部年份" : y}
                </option>
              ))}
            </select>
          </label>

          <label style={{ gridColumn: isNarrow ? "1 / -1" : "span 4" }}>
            <div style={styles.label}>月份</div>
            <select style={styles.select} value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m === "全部" ? "全部月份" : `${m}月`}
                </option>
              ))}
            </select>
          </label>

          <div style={{ gridColumn: isNarrow ? "1 / -1" : "span 4" }}>
            <div style={styles.label}>預算</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={{ ...styles.input, flex: "1 1 160px" }}
                placeholder="預算"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
              />
              <button style={{ ...styles.btn, flex: isNarrow ? "1 1 100%" : "0 0 auto" }} onClick={saveBudget}>
                儲存預算
              </button>
            </div>
          </div>

          <div style={{ gridColumn: isNarrow ? "1 / -1" : "span 4" }}>
            <Stat title="收入" value={summary.income} tone="income" />
          </div>
          <div style={{ gridColumn: isNarrow ? "1 / -1" : "span 4" }}>
            <Stat title="支出" value={summary.expense} tone="expense" />
          </div>
          <div style={{ gridColumn: isNarrow ? "1 / -1" : "span 4" }}>
            <Stat title="結餘" value={summary.balance} tone={summary.balance < 0 ? "bad" : "neutral"} />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#95a0b5" }}>
              <div>預算使用</div>
              <div>{budgetResolved > 0 ? `${Math.round(budgetRatio * 100)}%` : "未設定"}</div>
            </div>
            <div style={styles.progressOuter}>
              <div style={{ ...styles.progressInner, width: `${budgetRatio * 100}%` }} />
            </div>
            {budgetResolved > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: budgetRatio >= 1 ? "#ff5a5f" : "#95a0b5" }}>
                剩餘可用：{(budgetResolved - summary.expense).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== 新增交易 ===== */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>新增交易</div>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: isNarrow ? "1fr" : "repeat(12, minmax(0, 1fr))",
            alignItems: "end",
            marginTop: 10,
          }}
        >
          <label style={{ gridColumn: isNarrow ? "1 / -1" : "span 3" }}>
            <div style={styles.label}>日期</div>
            <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <div style={{ gridColumn: isNarrow ? "1 / -1" : "span 4" }}>
            <div style={styles.label}>類型</div>
            <div style={styles.segment}>
              <button
                type="button"
                style={{ ...styles.segBtn, ...(type === "支出" ? styles.segActive : null) }}
                onClick={() => setType("支出")}
              >
                支出
              </button>
              <button
                type="button"
                style={{ ...styles.segBtn, ...(type === "收入" ? styles.segActive : null) }}
                onClick={() => setType("收入")}
              >
                收入
              </button>
            </div>
          </div>

          <label style={{ gridColumn: isNarrow ? "1 / -1" : "span 5" }}>
            <div style={styles.label}>分類</div>
            <select style={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label style={{ gridColumn: isNarrow ? "1 / -1" : "span 4" }}>
            <div style={styles.label}>金額</div>
            <input style={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>

          <label style={{ gridColumn: isNarrow ? "1 / -1" : "span 8" }}>
            <div style={styles.label}>備註</div>
            <input style={styles.input} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <button style={{ ...styles.btn, minWidth: isNarrow ? 120 : 100 }} onClick={addTx}>
              新增
            </button>
            <button style={{ ...styles.btnGhost, minWidth: isNarrow ? 120 : 100 }} onClick={addCategory}>
              新增分類
            </button>
            <button style={{ ...styles.btnGhost, marginLeft: "auto" }} onClick={loadAll}>
              重新整理
            </button>
          </div>
        </div>
      </div>

      {/* ===== 列表 ===== */}
      <div style={{ ...styles.card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
          <div style={styles.cardTitle}>交易列表</div>
          <div style={styles.hint}>顯示：{filterLabel}</div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={th}>日期</th>
                <th style={th}>類型</th>
                <th style={th}>分類</th>
                <th style={th}>金額</th>
                <th style={th}>備註</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={td}>{r.date}</td>
                  <td style={td}>
                    <span style={{ ...styles.pill, ...(r.type === "收入" ? styles.pillIncome : styles.pillExpense) }}>
                      {r.type}
                    </span>
                  </td>
                  <td style={td}>{r.category}</td>
                  <td style={td}>
                    <span style={{ color: r.type === "收入" ? styles.colors.income : styles.colors.expense }}>
                      {Number(r.amount).toLocaleString()}
                    </span>
                  </td>
                  <td style={td}>{r.note}</td>
                  <td style={td}>
                    <button style={styles.btnTiny} onClick={() => delTx(r.id)}>
                      刪
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td style={{ padding: 14, color: "#aab2c2" }} colSpan={6}>
                    目前沒有資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ title, value, tone }) {
  const color =
    tone === "income"
      ? styles.colors.income
      : tone === "expense"
      ? styles.colors.expense
      : tone === "bad"
      ? styles.colors.bad
      : "#eaeef6";

  return (
    <div style={styles.statCard}>
      <div style={{ fontSize: 12, color: "#aab2c2" }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color }}>{Number(value).toLocaleString()}</div>
    </div>
  );
}

const th = { padding: 12, fontSize: 12, color: "#aab2c2", fontWeight: 800, whiteSpace: "nowrap" };
const td = { padding: 12, color: "#eaeef6", verticalAlign: "top" };

const styles = {
  colors: {
    income: "#3ad17a",
    expense: "#ff5a5f",
    bad: "#ff5a5f",
  },
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 700px at 20% 10%, rgba(120,140,255,0.20), transparent 55%), radial-gradient(900px 600px at 90% 0%, rgba(58,209,122,0.12), transparent 60%), #0b0f1a",
    padding: 16,
  },
  container: { maxWidth: 980, margin: "0 auto" },
  topRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  h1: { fontSize: 28, fontWeight: 950, color: "#eef3ff" },
  hint: { fontSize: 12, color: "#95a0b5" },
  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    backdropFilter: "blur(10px)",
  },
  cardTitle: { fontSize: 16, fontWeight: 950, color: "#eef3ff" },
  label: { fontSize: 12, color: "#aab2c2", marginBottom: 6 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.22)",
    color: "#eef3ff",
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.22)",
    color: "#eef3ff",
    outline: "none",
  },
  btn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(59,130,246,0.85)",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  btnGhost: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.18)",
    color: "#eef3ff",
    fontWeight: 900,
    cursor: "pointer",
  },
  btnTiny: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.18)",
    color: "#eef3ff",
    cursor: "pointer",
  },
  statCard: {
    borderRadius: 16,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.12)",
  },
  segment: {
    display: "flex",
    gap: 6,
    padding: 6,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.18)",
  },
  segBtn: {
    flex: 1,
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid transparent",
    background: "transparent",
    color: "#eaeef6",
    fontWeight: 950,
    cursor: "pointer",
  },
  segActive: {
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.14)",
  },
  pill: { display: "inline-block", padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 950 },
  pillIncome: {
    background: "rgba(58,209,122,0.14)",
    color: "#a9f3c6",
    border: "1px solid rgba(58,209,122,0.25)",
  },
  pillExpense: {
    background: "rgba(255,90,95,0.14)",
    color: "#ffc0c2",
    border: "1px solid rgba(255,90,95,0.25)",
  },
  progressOuter: {
    height: 10,
    borderRadius: 999,
    background: "rgba(255,255,255,0.10)",
    overflow: "hidden",
    marginTop: 6,
  },
  progressInner: { height: "100%", borderRadius: 999, background: "rgba(59,130,246,0.85)" },
};
