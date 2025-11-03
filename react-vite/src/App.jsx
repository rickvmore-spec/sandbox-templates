import React, { useEffect, useMemo, useState } from "react";

/**
 * IMDb + Breakdown Services–style Casting Platform (Single-file React Demo)
 * ------------------------------------------------------------------------
 * Implements requests 1–5:
 * 1) Submission state engine + audit trail
 * 2) Talent profile editor (with validation)
 * 3) Advanced search (facets, saved searches, bulk actions)
 * 4) Self‑tape request flow (templated + due date + sides link)
 * 5) Auth & roles scaffolding (mocked users/permissions)
 *
 * Notes
 *  - This is a front‑end scaffold using Tailwind and local state (no backend).
 *  - Swap stubs with your API (Next.js/Express/FastAPI) + DB (Postgres) + Storage (S3/R2).
 *  - Replace mock auth with Clerk/Auth0/Supabase/Auth.js; wire route guards server‑side.
 */

// ---------- Types

type UnionStatus = "SAG-AFTRA" | "Non-Union" | "Other";

type RoleName = "Casting Admin" | "Casting Associate" | "Agent" | "Talent" | "Producer";

type User = {
  id: string;
  name: string;
  role: RoleName;
  org?: string;
  email?: string;
};

type Talent = {
  id: string;
  userId?: string; // if Talent logs in
  stageName: string;
  legalName?: string;
  age: number;
  heightInches: number;
  union: UnionStatus;
  pronouns?: string;
  city?: string;
  workAuth?: string[]; // US, CAN, EU, O1, etc.
  primaryRep?: string; // agency or manager name
  headshotUrl?: string;
  fullBodyUrl?: string;
  reelUrl?: string;
  resumeUrl?: string;
  skills?: string[]; // languages, accents, dance, stunt, instruments
  tags?: string[]; // quick search facets
  notes?: string;
};

type Role = {
  id: string;
  title: string;
  description: string;
  gender?: string;
  ageRange?: [number, number];
  union?: UnionStatus | "Open";
  rate?: string; // e.g., "$1250/day + 10%"
  specialSkills?: string[];
  status: "New" | "Reviewing" | "Shortlist" | "Booked";
};

type Project = {
  id: string;
  title: string;
  productionType: "Film" | "TV" | "Commercial" | "Theater" | "Digital";
  company?: string;
  city?: string;
  roles: Role[];
  notes?: string;
  owners?: string[]; // userIds allowed to manage
};

type SubmissionStatus =
  | "Unread"
  | "Viewed"
  | "Requested Self-Tape"
  | "Callback"
  | "Pinned"
  | "Avail Check"
  | "Offer"
  | "Booked"
  | "Pass";

type AuditEvent = {
  id: string;
  submissionId: string;
  at: string; // ISO
  actorUserId: string;
  action:
    | { type: "STATUS_CHANGE"; from: SubmissionStatus; to: SubmissionStatus }
    | { type: "MESSAGE"; body: string }
    | { type: "SELF_TAPE_REQUEST"; dueISO: string; sidesUrl?: string; instructions?: string };
};

type Submission = {
  id: string;
  roleId: string;
  projectId: string;
  talentId: string;
  submittedBy: "Talent" | "Agent";
  coverNote?: string;
  materials?: { resumeUrl?: string; reelUrl?: string; extraFiles?: string[] };
  status: SubmissionStatus;
  createdAt: string; // ISO
};

// ---------- Mock Auth (5. Auth & roles scaffolding)

const MOCK_USERS: User[] = [
  { id: "u1", name: "Casey (Admin)", role: "Casting Admin", org: "Hudson Studios", email: "admin@hudson.test" },
  { id: "u2", name: "Alex (Associate)", role: "Casting Associate", org: "Hudson Studios" },
  { id: "u3", name: "Riley (Agent)", role: "Agent", org: "Northstar Talent" },
  { id: "u4", name: "Ari James", role: "Talent" },
  { id: "u5", name: "Maya Chen", role: "Talent" },
  { id: "u6", name: "Jordan (Producer)", role: "Producer" },
];

// permission helpers (very simplified)
const canManageProjects = (me?: User | null) => !!me && (me.role === "Casting Admin" || me.role === "Casting Associate");
const canViewInbox = (me?: User | null) => !!me && me.role !== "Producer"; // everyone but read‑only Producer
const canSubmitTalent = (me?: User | null) => !!me && (me.role === "Agent" || me.role === "Talent");
const canChangeSubmission = (me?: User | null) => !!me && (me.role === "Casting Admin" || me.role === "Casting Associate");

// ---------- Mock Data

const TALENT_INIT: Talent[] = [
  {
    id: "t1",
    userId: "u4",
    stageName: "Ari James",
    age: 27,
    heightInches: 71,
    union: "SAG-AFTRA",
    pronouns: "he/him",
    city: "Los Angeles",
    primaryRep: "Northstar Talent",
    headshotUrl: "https://images.unsplash.com/photo-1602471615287-8d86d25f1b5e?q=80&w=1200&auto=format&fit=crop",
    reelUrl: "https://player.vimeo.com/video/76979871",
    skills: ["Boxing", "Spanish", "Guitar"],
    tags: ["action", "leading"],
    resumeUrl: "https://example.com/resume-ari.pdf",
    workAuth: ["US"],
  },
  {
    id: "t2",
    userId: "u5",
    stageName: "Maya Chen",
    age: 24,
    heightInches: 65,
    union: "SAG-AFTRA",
    pronouns: "she/her",
    city: "Los Angeles",
    primaryRep: "Apex Mgmt",
    headshotUrl: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?q=80&w=1200&auto=format&fit=crop",
    skills: ["Dance", "Mandarin", "Piano"],
    tags: ["comedy", "series-regular"],
    workAuth: ["US", "CAN"],
  },
  {
    id: "t3",
    stageName: "Leo Martins",
    age: 33,
    heightInches: 70,
    union: "Non-Union",
    pronouns: "he/they",
    city: "WeHo",
    primaryRep: "—",
    headshotUrl: "https://images.unsplash.com/photo-1544006659-f0b21884ce1d?q=80&w=1200&auto=format&fit=crop",
    skills: ["Improv", "Brazilian Portuguese"],
    tags: ["supporting", "quirky"],
    workAuth: ["US"],
  },
];

const PROJECTS_INIT: Project[] = [
  {
    id: "p1",
    title: "ALL IN (Pilot)",
    productionType: "TV",
    company: "Hudson Studios",
    city: "Los Angeles",
    notes: "10-week limited; network pilot.",
    owners: ["u1", "u2"],
    roles: [
      {
        id: "r1",
        title: "Tyler (Lead)",
        description:
          "25–30, charismatic, athletic. Must be comfortable with light stunt work.",
        gender: "Male",
        ageRange: [25, 30],
        union: "SAG-AFTRA",
        rate: "$1,250/day + 10%",
        specialSkills: ["Stunts: basic falls", "Boxing footwork"],
        status: "New",
      },
      {
        id: "r2",
        title: "Harper (Series Regular)",
        description: "22–28, dry wit, excellent comedic timing.",
        gender: "Female",
        ageRange: [22, 28],
        union: "SAG-AFTRA",
        rate: "$950/day",
        specialSkills: ["Improv", "Piano"],
        status: "Reviewing",
      },
    ],
  },
];

const SUBMISSIONS_INIT: Submission[] = [
  {
    id: "s1",
    roleId: "r1",
    projectId: "p1",
    talentId: "t1",
    submittedBy: "Agent",
    coverNote: "Strong boxer, athletic; available all dates.",
    materials: { resumeUrl: "https://example.com/resume-ari.pdf" },
    status: "Unread",
    createdAt: new Date().toISOString(),
  },
  {
    id: "s2",
    roleId: "r2",
    projectId: "p1",
    talentId: "t2",
    submittedBy: "Agent",
    coverNote: "UCB alum, musical background.",
    status: "Viewed",
    createdAt: new Date().toISOString(),
  },
  {
    id: "s3",
    roleId: "r1",
    projectId: "p1",
    talentId: "t3",
    submittedBy: "Talent",
    coverNote: "Great with physical comedy; flexible to rehearse.",
    status: "Requested Self-Tape",
    createdAt: new Date().toISOString(),
  },
];

// ---------- Helpers

const inchesToFeet = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}\"`;
function classNames(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(" "); }
const isoNow = () => new Date().toISOString();

// ---------- UI Primitives

function Chip({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center rounded-full border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">
      {label}
    </button>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ---------- Main App

export default function CastingMVPApp() {
  // Auth state (5)
  const [me, setMe] = useState<User | null>(MOCK_USERS[0]);

  // Core data
  const [talent, setTalent] = useState<Talent[]>(TALENT_INIT);
  const [projects, setProjects] = useState<Project[]>(PROJECTS_INIT);
  const [submissions, setSubmissions] = useState<Submission[]>(SUBMISSIONS_INIT);
  const [audits, setAudits] = useState<AuditEvent[]>([]);

  // UI state
  const [personaTab, setPersonaTab] = useState<"Casting" | "Agent" | "Talent" | "Producer">("Casting");

  // Advanced search (3)
  const [query, setQuery] = useState("");
  const [minAge, setMinAge] = useState<number | "">("");
  const [maxAge, setMaxAge] = useState<number | "">("");
  const [unionFilter, setUnionFilter] = useState<UnionStatus | "">("");
  const [tag, setTag] = useState<string>("");
  const [minHeight, setMinHeight] = useState<number | "">("");
  const [maxHeight, setMaxHeight] = useState<number | "">("");
  const [city, setCity] = useState<string>("");
  const [skillIncludes, setSkillIncludes] = useState<string>(""); // comma‑sep list
  const [savedSearches, setSavedSearches] = useState<{ name: string; payload: any }[]>([]);
  const [bulkSelectedTalent, setBulkSelectedTalent] = useState<Set<string>>(new Set());

  // Talent editor (2)
  const [selectedTalent, setSelectedTalent] = useState<Talent | null>(null);
  const [editTalent, setEditTalent] = useState<Talent | null>(null);

  // Submission modal state (1,4)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [selfTapeOpen, setSelfTapeOpen] = useState(false);
  const [selfTapeForm, setSelfTapeForm] = useState<{ dueISO: string; sidesUrl: string; instructions: string }>({ dueISO: "", sidesUrl: "", instructions: "Slate: name/height/role." });

  // Quick breakdown form
  const [newRole, setNewRole] = useState<Partial<Role>>({ status: "New" });
  const [newProjectTitle, setNewProjectTitle] = useState("");

  // ---------- Effects
  useEffect(() => {
    // demo: seed an audit for existing self‑tape
    const st = submissions.find((s) => s.status === "Requested Self-Tape");
    if (st && audits.length === 0) {
      setAudits([
        { id: "a1", submissionId: st.id, at: isoNow(), actorUserId: "u2", action: { type: "SELF_TAPE_REQUEST", dueISO: new Date(Date.now()+3*24*3600*1000).toISOString(), sidesUrl: "https://example.com/sides.pdf", instructions: "Slate + scene 12; clap sync." } },
      ]);
    }
  }, []); // eslint-disable-line

  // ---------- Derived
  const filteredTalent = useMemo(() => {
    const mustSkills = skillIncludes
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return talent.filter((t) => {
      const q = query.toLowerCase();
      const matchesQuery =
        !q ||
        t.stageName.toLowerCase().includes(q) ||
        (t.skills || []).some((s) => s.toLowerCase().includes(q)) ||
        (t.tags || []).some((tg) => tg.toLowerCase().includes(q));
      const matchesAge = (minAge === "" || t.age >= Number(minAge)) && (maxAge === "" || t.age <= Number(maxAge));
      const matchesUnion = !unionFilter || t.union === unionFilter;
      const matchesTag = !tag || (t.tags || []).map((x) => x.toLowerCase()).includes(tag.toLowerCase());
      const matchesCity = !city || (t.city || "").toLowerCase().includes(city.toLowerCase());
      const matchesHeight = (minHeight === "" || t.heightInches >= Number(minHeight)) && (maxHeight === "" || t.heightInches <= Number(maxHeight));
      const matchesSkills = mustSkills.every((ms) => (t.skills || []).map((x) => x.toLowerCase()).includes(ms));
      return matchesQuery && matchesAge && matchesUnion && matchesTag && matchesCity && matchesHeight && matchesSkills;
    });
  }, [talent, query, minAge, maxAge, unionFilter, tag, city, minHeight, maxHeight, skillIncludes]);

  // ---------- Actions (1) Submission state engine + audit trail
  function logAudit(ev: AuditEvent) { setAudits((prev) => [ev, ...prev]); }

  function updateSubmissionStatus(id: string, to: SubmissionStatus) {
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status: to } : s)));
    const from = submissions.find((s) => s.id === id)?.status || "Unread";
    logAudit({ id: `a_${Math.random().toString(36).slice(2)}`, submissionId: id, at: isoNow(), actorUserId: me?.id || "system", action: { type: "STATUS_CHANGE", from, to } });
  }

  function sendMessage(id: string, body: string) {
    logAudit({ id: `a_${Math.random().toString(36).slice(2)}`, submissionId: id, at: isoNow(), actorUserId: me?.id || "system", action: { type: "MESSAGE", body } });
    alert("(stub) Message queued to talent/agent.");
  }

  // (4) Self‑tape request flow
  function openSelfTape(sub: Submission) {
    setSelectedSubmission(sub);
    setSelfTapeOpen(true);
    setSelfTapeForm({ dueISO: "", sidesUrl: "", instructions: "Slate: name/height/role." });
  }

  function submitSelfTapeRequest() {
    if (!selectedSubmission) return;
    const { dueISO, sidesUrl, instructions } = selfTapeForm;
    if (!dueISO) { alert("Please set a due date/time"); return; }
    updateSubmissionStatus(selectedSubmission.id, "Requested Self-Tape");
    logAudit({ id: `a_${Math.random().toString(36).slice(2)}`, submissionId: selectedSubmission.id, at: isoNow(), actorUserId: me?.id || "system", action: { type: "SELF_TAPE_REQUEST", dueISO, sidesUrl, instructions } });
    setSelfTapeOpen(false);
    alert("Self‑tape request sent (stub).");
  }

  // (2) Talent profile editor helpers
  function openTalentProfile(t: Talent) {
    setSelectedTalent(t);
    setEditTalent({ ...t });
  }

  function saveTalentProfile() {
    if (!editTalent) return;
    // minimal validation
    if (!editTalent.stageName?.trim()) { alert("Stage name is required"); return; }
    if (!Number.isFinite(editTalent.age) || editTalent.age < 5 || editTalent.age > 100) { alert("Age looks invalid"); return; }
    setTalent((prev) => prev.map((x) => (x.id === editTalent.id ? { ...editTalent } : x)));
    setSelectedTalent(null);
    setEditTalent(null);
  }

  // (3) Saved searches
  function saveCurrentSearch() {
    const name = prompt("Name this search (e.g., 'SAG 22–28 LA comedy')");
    if (!name) return;
    const payload = { query, minAge, maxAge, unionFilter, tag, city, minHeight, maxHeight, skillIncludes };
    setSavedSearches((prev) => [{ name, payload }, ...prev]);
  }

  function applySavedSearch(ss: { name: string; payload: any }) {
    const p = ss.payload;
    setQuery(p.query || "");
    setMinAge(p.minAge ?? "");
    setMaxAge(p.maxAge ?? "");
    setUnionFilter(p.unionFilter || "");
    setTag(p.tag || "");
    setCity(p.city || "");
    setMinHeight(p.minHeight ?? "");
    setMaxHeight(p.maxHeight ?? "");
    setSkillIncludes(p.skillIncludes || "");
  }

  // (3) Bulk actions for talent search results
  function toggleBulk(talentId: string) {
    setBulkSelectedTalent((prev) => {
      const n = new Set(prev);
      if (n.has(talentId)) n.delete(talentId); else n.add(talentId);
      return n;
    });
  }

  function bulkInviteSelfTape() {
    if (!canChangeSubmission(me)) { alert("You don't have permission"); return; }
    if (bulkSelectedTalent.size === 0) { alert("Select at least one talent"); return; }
    alert(`(stub) Invited ${bulkSelectedTalent.size} talent to submit for selected role.`);
  }

  // Project/Role helpers
  function addBreakdown() {
    if (!canManageProjects(me)) { alert("No permission"); return; }
    if (!newProjectTitle || !newRole.title) return;
    const projectId = `p${projects.length + 1}`;
    const roleId = `r${projects.flatMap((p) => p.roles).length + 1}`;
    const project: Project = {
      id: projectId,
      title: newProjectTitle,
      productionType: "Film",
      roles: [
        {
          id: roleId,
          title: newRole.title!,
          description: newRole.description || "",
          gender: newRole.gender,
          ageRange: (newRole.ageRange as [number, number]) || [18, 65],
          union: (newRole.union as UnionStatus) || "SAG-AFTRA",
          rate: newRole.rate || "",
          specialSkills: newRole.specialSkills || [],
          status: "New",
        },
      ],
      owners: [me?.id || "u1"],
    };
    setProjects((prev) => [project, ...prev]);
    setNewProjectTitle("");
    setNewRole({ status: "New" });
  }

  function moveRole(projectId: string, roleId: string, status: Role["status"]) {
    if (!canManageProjects(me)) { alert("No permission"); return; }
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== projectId
          ? p
          : { ...p, roles: p.roles.map((r) => (r.id === roleId ? { ...r, status } : r)) }
      )
    );
  }

  // ---------- Render
  return (
    <div className="mx-auto max-w-7xl p-4">
      {/* Header with Auth (5) */}
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Casting Board (IMDb + Breakdown MVP)</h1>
          <p className="text-sm text-gray-600">Auth/roles, audit trail, advanced search, self‑tapes, editor — all stubbed client‑side.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={me?.id} onChange={(e) => setMe(MOCK_USERS.find(u => u.id === e.target.value) || null)} className="rounded-xl border border-gray-300 p-2">
            {MOCK_USERS.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
          </select>
          <div className="hidden md:flex items-center gap-2">
            {(["Casting", "Agent", "Talent", "Producer"] as const).map((r) => (
              <button key={r} onClick={() => setPersonaTab(r)} className={classNames("rounded-full px-4 py-2 text-sm", personaTab === r ? "bg-black text-white" : "border border-gray-300 hover:bg-gray-50")}>{r}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Column: Talent Search (3 + 2 bulk) */}
        <Section title="Talent Search" right={<div className="flex items-center gap-2 text-xs text-gray-500"><span>{filteredTalent.length} matches</span><button className="rounded-full border px-2 py-1" onClick={saveCurrentSearch}>Save search</button></div>}>
          {/* Facets */}
          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <input placeholder="Search name/skill/tag…" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-xl border border-gray-300 p-2" />
            <input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="rounded-xl border border-gray-300 p-2" />
            <select value={unionFilter} onChange={(e) => setUnionFilter((e.target.value as UnionStatus) || "")} className="rounded-xl border border-gray-300 p-2">
              <option value="">Union (any)</option>
              <option value="SAG-AFTRA">SAG-AFTRA</option>
              <option value="Non-Union">Non-Union</option>
              <option value="Other">Other</option>
            </select>
            <input placeholder="Min age" type="number" value={minAge} onChange={(e) => setMinAge(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-xl border border-gray-300 p-2" />
            <input placeholder="Max age" type="number" value={maxAge} onChange={(e) => setMaxAge(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-xl border border-gray-300 p-2" />
            <input placeholder="Min height (in)" type="number" value={minHeight} onChange={(e) => setMinHeight(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-xl border border-gray-300 p-2" />
            <input placeholder="Max height (in)" type="number" value={maxHeight} onChange={(e) => setMaxHeight(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-xl border border-gray-300 p-2" />
            <input placeholder="Tag (e.g., action)" value={tag} onChange={(e) => setTag(e.target.value)} className="rounded-xl border border-gray-300 p-2" />
            <input placeholder="Must include skills (comma‑separated)" value={skillIncludes} onChange={(e) => setSkillIncludes(e.target.value)} className="rounded-xl border border-gray-300 p-2 md:col-span-2" />
          </div>

          {/* Saved searches */}
          {savedSearches.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {savedSearches.map((s, i) => (
                <Chip key={i} label={`🔖 ${s.name}`} onClick={() => applySavedSearch(s)} />
              ))}
            </div>
          )}

          {/* Bulk actions */}
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs text-gray-600">Bulk selected: {bulkSelectedTalent.size}</div>
            <div className="flex gap-2">
              <button className="rounded-lg border px-3 py-1 text-xs" onClick={() => setBulkSelectedTalent(new Set())}>Clear</button>
              <button className="rounded-lg bg-black px-3 py-1 text-xs text-white" onClick={bulkInviteSelfTape}>Invite selected to self‑tape (stub)</button>
            </div>
          </div>

          {/* Results */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredTalent.map((t) => (
              <div key={t.id} className="flex gap-3 rounded-xl border border-gray-200 p-3">
                <input type="checkbox" className="mt-1" checked={bulkSelectedTalent.has(t.id)} onChange={() => toggleBulk(t.id)} />
                <img src={t.headshotUrl} alt={t.stageName} className="h-24 w-20 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate font-semibold">{t.stageName}</h3>
                    <span className="text-xs text-gray-500">{t.union}</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {t.pronouns ? `${t.pronouns} · ` : ""}{t.age}y · {inchesToFeet(t.heightInches)} · {t.city || "—"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(t.skills || []).slice(0, 5).map((s) => <Chip key={s} label={s} />)}
                    {(t.tags || []).map((tg) => <Chip key={tg} label={`#${tg}`} />)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="rounded-lg bg-black px-3 py-1 text-xs text-white" onClick={() => openTalentProfile(t)}>View / Edit</button>
                    {canSubmitTalent(me) && <button className="rounded-lg border px-3 py-1 text-xs" onClick={() => alert("Submit flow TBD")}>Submit</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Column: Submissions Inbox (1 + audit log) */}
        <Section title="Submissions Inbox" right={<span className="text-xs text-gray-500">{submissions.length} total</span>}>
          {canViewInbox(me) ? (
            <>
              <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-gray-600">
                {(["Unread", "Viewed", "Requested Self-Tape", "Callback", "Pinned", "Avail Check", "Offer", "Booked", "Pass"] as SubmissionStatus[]).map((st) => (
                  <span key={st} className="rounded-full bg-gray-100 px-2 py-1">{st}</span>
                ))}
              </div>
              <ul className="divide-y">
                {submissions.map((s) => {
                  const t = talent.find((x) => x.id === s.talentId)!;
                  const proj = projects.find((p) => p.id === s.projectId)!;
                  const r = proj.roles.find((ro) => ro.id === s.roleId)!;
                  return (
                    <li key={s.id} className="flex items-center gap-3 py-2">
                      <img src={t.headshotUrl} alt={t.stageName} className="h-12 w-10 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm"><span className="font-medium">{t.stageName}</span> → {r.title} <span className="text-gray-500">({proj.title})</span></p>
                        <p className="truncate text-xs text-gray-500">{s.coverNote || "—"}</p>
                      </div>
                      <span className="rounded-full border px-2 py-1 text-xs">{s.status}</span>
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => setSelectedSubmission(s)}>Open</button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-gray-600">Read‑only role — inbox hidden.</p>
          )}
        </Section>

        {/* Column: Projects & Roles (Kanban-lite) */}
        <Section title="Projects & Roles">
          {canManageProjects(me) ? (
            <div className="mb-3 rounded-xl border border-dashed p-3">
              <h4 className="mb-2 font-semibold">Quick Breakdown</h4>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input placeholder="Project title (e.g., 'Feature: BLUE HOUR')" value={newProjectTitle} onChange={(e) => setNewProjectTitle(e.target.value)} className="rounded-xl border border-gray-300 p-2" />
                <input placeholder="Role title (e.g., 'Jules – Lead')" value={newRole.title || ""} onChange={(e) => setNewRole({ ...newRole, title: e.target.value })} className="rounded-xl border border-gray-300 p-2" />
                <button className="rounded-xl bg-black px-4 py-2 text-white" onClick={addBreakdown}>Add Breakdown</button>
              </div>
              <textarea placeholder="Role description, age range, skills…" value={newRole.description || ""} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} className="mt-2 w-full rounded-xl border border-gray-300 p-2" />
            </div>
          ) : (
            <p className="mb-3 text-sm text-gray-600">You don't have permissions to create breakdowns.</p>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="rounded-xl border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-semibold">{p.title}</h4>
                  <span className="text-xs text-gray-500">{p.productionType}</span>
                </div>
                <ul className="space-y-2">
                  {p.roles.map((r) => (
                    <li key={r.id} className="rounded-lg border p-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{r.title}</p>
                          <p className="text-xs text-gray-600">{r.description}</p>
                        </div>
                        <span className="rounded-full border px-2 py-1 text-xs">{r.status}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {["New", "Reviewing", "Shortlist", "Booked"].map((st) => (
                          <button key={st} onClick={() => moveRole(p.id, r.id, st as Role["status"]) } className={classNames("rounded-full px-2 py-1 text-xs", r.status === st ? "bg-black text-white" : "border")}>
                            {st}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Talent Profile Modal (2) */}
      <Modal open={!!selectedTalent} onClose={() => { setSelectedTalent(null); setEditTalent(null); }}>
        {editTalent && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <img src={editTalent.headshotUrl} className="h-28 w-24 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-xl font-semibold">{editTalent.stageName}</h3>
                <p className="text-sm text-gray-600">{editTalent.pronouns ? `${editTalent.pronouns} · ` : ""}{editTalent.age}y · {inchesToFeet(editTalent.heightInches)} · {editTalent.union}</p>
                <p className="text-xs text-gray-500">Rep: {editTalent.primaryRep || "—"}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <label className="text-xs">Stage Name<input className="w-full rounded-xl border p-2" value={editTalent.stageName} onChange={(e) => setEditTalent({ ...editTalent, stageName: e.target.value })} /></label>
              <label className="text-xs">Age<input type="number" className="w-full rounded-xl border p-2" value={editTalent.age} onChange={(e) => setEditTalent({ ...editTalent, age: Number(e.target.value) })} /></label>
              <label className="text-xs">Height (in)<input type="number" className="w-full rounded-xl border p-2" value={editTalent.heightInches} onChange={(e) => setEditTalent({ ...editTalent, heightInches: Number(e.target.value) })} /></label>
              <label className="text-xs">Pronouns<input className="w-full rounded-xl border p-2" value={editTalent.pronouns || ""} onChange={(e) => setEditTalent({ ...editTalent, pronouns: e.target.value })} /></label>
              <label className="text-xs">City<input className="w-full rounded-xl border p-2" value={editTalent.city || ""} onChange={(e) => setEditTalent({ ...editTalent, city: e.target.value })} /></label>
              <label className="text-xs">Union<select className="w-full rounded-xl border p-2" value={editTalent.union} onChange={(e) => setEditTalent({ ...editTalent, union: e.target.value as UnionStatus })}><option>SAG-AFTRA</option><option>Non-Union</option><option>Other</option></select></label>
              <label className="text-xs md:col-span-3">Skills (comma‑sep)<input className="w-full rounded-xl border p-2" value={(editTalent.skills || []).join(", ")} onChange={(e) => setEditTalent({ ...editTalent, skills: e.target.value.split(",").map(s=>s.trim()).filter(Boolean) })} /></label>
              <label className="text-xs md:col-span-3">Tags (comma‑sep)<input className="w-full rounded-xl border p-2" value={(editTalent.tags || []).join(", ")} onChange={(e) => setEditTalent({ ...editTalent, tags: e.target.value.split(",").map(s=>s.trim()).filter(Boolean) })} /></label>
              <label className="text-xs md:col-span-3">Headshot URL<input className="w-full rounded-xl border p-2" value={editTalent.headshotUrl || ""} onChange={(e) => setEditTalent({ ...editTalent, headshotUrl: e.target.value })} /></label>
              <label className="text-xs md:col-span-3">Reel URL<input className="w-full rounded-xl border p-2" value={editTalent.reelUrl || ""} onChange={(e) => setEditTalent({ ...editTalent, reelUrl: e.target.value })} /></label>
              <label className="text-xs md:col-span-3">Resume URL<input className="w-full rounded-xl border p-2" value={editTalent.resumeUrl || ""} onChange={(e) => setEditTalent({ ...editTalent, resumeUrl: e.target.value })} /></label>
              <label className="text-xs md:col-span-3">Notes<textarea className="w-full rounded-xl border p-2" value={editTalent.notes || ""} onChange={(e) => setEditTalent({ ...editTalent, notes: e.target.value })} /></label>
            </div>
            <div className="flex justify-end gap-2">
              <button className="rounded-lg border px-3 py-1" onClick={() => { setSelectedTalent(null); setEditTalent(null); }}>Cancel</button>
              <button className="rounded-lg bg-black px-3 py-1 text-white" onClick={saveTalentProfile}>Save</button>
            </div>
            {editTalent.reelUrl && (
              <div className="aspect-video w-full overflow-hidden rounded-xl">
                <iframe className="h-full w-full" src={editTalent.reelUrl} allow="autoplay; fullscreen" />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Submission Modal w/ audit + self‑tape (1,4) */}
      <Modal open={!!selectedSubmission} onClose={() => setSelectedSubmission(null)}>
        {selectedSubmission && (
          <div className="space-y-3">
            {(() => {
              const t = talent.find((x) => x.id === selectedSubmission.talentId)!;
              const proj = projects.find((p) => p.id === selectedSubmission.projectId)!;
              const r = proj.roles.find((ro) => ro.id === selectedSubmission.roleId)!;
              const myAudits = audits.filter((a) => a.submissionId === selectedSubmission.id);
              return (
                <>
                  <div className="flex items-start gap-3">
                    <img src={t.headshotUrl} className="h-24 w-20 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{t.stageName} → {r.title} <span className="text-gray-500">({proj.title})</span></h3>
                      <p className="truncate text-xs text-gray-600">{selectedSubmission.coverNote || "—"}</p>
                    </div>
                    <span className="rounded-full border px-2 py-1 text-xs">{selectedSubmission.status}</span>
                  </div>

                  {canChangeSubmission(me) && (
                    <div className="flex flex-wrap gap-2">
                      {(["Viewed", "Requested Self-Tape", "Callback", "Pinned", "Avail Check", "Offer", "Booked", "Pass"] as SubmissionStatus[]).map((st) => (
                        <button key={st} onClick={() => updateSubmissionStatus(selectedSubmission.id, st)} className={classNames("rounded-full px-2 py-1 text-xs", selectedSubmission.status === st ? "bg-black text-white" : "border")}>{st}</button>
                      ))}
                      <button className="rounded-full border px-2 py-1 text-xs" onClick={() => sendMessage(selectedSubmission.id, "Thanks for submitting — we will follow up soon.")}>Quick msg</button>
                      <button className="rounded-full border px-2 py-1 text-xs" onClick={() => openSelfTape(selectedSubmission)}>Request self‑tape</button>
                    </div>
                  )}

                  <div>
                    <h4 className="mb-1 font-semibold">Audit Trail</h4>
                    <ul className="max-h-48 space-y-1 overflow-auto rounded border p-2 text-xs">
                      {myAudits.length === 0 && <li className="text-gray-500">No events yet.</li>}
                      {myAudits.map((a) => (
                        <li key={a.id} className="flex items-start gap-2">
                          <span className="text-gray-400">{new Date(a.at).toLocaleString()}</span>
                          <div>
                            {a.action.type === "STATUS_CHANGE" && (
                              <span>Status → <b>{a.action.to}</b> (from {a.action.from})</span>
                            )}
                            {a.action.type === "MESSAGE" && (
                              <span>Message → “{a.action.body}”</span>
                            )}
                            {a.action.type === "SELF_TAPE_REQUEST" && (
                              <span>Self‑tape due <b>{new Date(a.action.dueISO).toLocaleString()}</b>{a.action.sidesUrl ? ` · sides: ${a.action.sidesUrl}` : ""}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button className="rounded-lg border px-3 py-1" onClick={() => setSelectedSubmission(null)}>Close</button>
                    <button className="rounded-lg bg-black px-3 py-1 text-white" onClick={() => sendMessage(selectedSubmission.id, "We pinned your submission for review.")}>Message</button>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* Self‑Tape Request Modal (4) */}
      <Modal open={selfTapeOpen} onClose={() => setSelfTapeOpen(false)}>
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Request Self‑Tape</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="text-xs">Due (ISO datetime)
              <input className="w-full rounded-xl border p-2" placeholder="2025-11-05T17:00:00Z" value={selfTapeForm.dueISO} onChange={(e) => setSelfTapeForm({ ...selfTapeForm, dueISO: e.target.value })} />
            </label>
            <label className="text-xs">Sides URL
              <input className="w-full rounded-xl border p-2" placeholder="https://…/sides.pdf" value={selfTapeForm.sidesUrl} onChange={(e) => setSelfTapeForm({ ...selfTapeForm, sidesUrl: e.target.value })} />
            </label>
            <label className="text-xs md:col-span-2">Instructions
              <textarea className="w-full rounded-xl border p-2" value={selfTapeForm.instructions} onChange={(e) => setSelfTapeForm({ ...selfTapeForm, instructions: e.target.value })} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button className="rounded-lg border px-3 py-1" onClick={() => setSelfTapeOpen(false)}>Cancel</button>
            <button className="rounded-lg bg-black px-3 py-1 text-white" onClick={submitSelfTapeRequest}>Send request</button>
          </div>
        </div>
      </Modal>

      <footer className="mt-6 text-center text-xs text-gray-500">
        Not affiliated with IMDb or Breakdown Services. Do not scrape proprietary data. Demo only — replace with your own user‑provided content and rights‑cleared media.
      </footer>
    </div>
  );
}

function OpenButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="rounded-lg bg-black px-3 py-1 text-xs text-white" onClick={onClick}>{children}</button>
  );
}

function openTalentProfile(t: Talent): void { /* shadowed in component; kept for TS friendliness */ }
