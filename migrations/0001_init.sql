-- QUIPU · Memoria de Talento — esquema inicial
-- Aislamiento multiempresa: toda entidad de negocio lleva org_id.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'EC',
  timezone TEXT NOT NULL DEFAULT 'America/Guayaquil',
  currency TEXT NOT NULL DEFAULT 'USD',
  settings TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','recruiter','hiring_manager','assessor','auditor')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, email)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  org_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  location TEXT,
  country TEXT NOT NULL DEFAULT 'EC',
  headline TEXT,
  summary TEXT,
  years_experience REAL NOT NULL DEFAULT 0,
  availability TEXT,
  salary_expectation REAL,
  source TEXT,
  consent_status TEXT NOT NULL DEFAULT 'pending' CHECK (consent_status IN ('granted','pending','revoked')),
  consent_basis TEXT,
  consent_date TEXT,
  retention_until TEXT,
  do_not_contact INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_candidates_org ON candidates(org_id);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(org_id, email);
CREATE INDEX IF NOT EXISTS idx_candidates_phone ON candidates(org_id, phone);

CREATE TABLE IF NOT EXISTS candidate_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 3 CHECK (level BETWEEN 1 AND 5),
  years REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'declarado',
  verified INTEGER NOT NULL DEFAULT 0,
  evidence_ref TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_skills_candidate ON candidate_skills(candidate_id);
CREATE INDEX IF NOT EXISTS idx_skills_org ON candidate_skills(org_id);

CREATE TABLE IF NOT EXISTS candidate_experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT,
  start_date TEXT,
  end_date TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  description TEXT
);
CREATE INDEX IF NOT EXISTS idx_exp_candidate ON candidate_experiences(candidate_id);

CREATE TABLE IF NOT EXISTS candidate_education (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  program TEXT NOT NULL,
  institution TEXT,
  level TEXT,
  year INTEGER
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'cv',
  filename TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'text/plain',
  size INTEGER NOT NULL DEFAULT 0,
  content_text TEXT,
  storage TEXT NOT NULL DEFAULT 'd1-inline',
  r2_key TEXT,
  parse_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_candidate ON documents(candidate_id);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  area TEXT,
  location TEXT,
  country TEXT NOT NULL DEFAULT 'EC',
  modality TEXT NOT NULL DEFAULT 'hibrido' CHECK (modality IN ('presencial','hibrido','remoto')),
  workday TEXT NOT NULL DEFAULT 'jornada completa',
  contract_type TEXT NOT NULL DEFAULT 'indefinido',
  seniority TEXT,
  salary_min REAL,
  salary_max REAL,
  description TEXT,
  responsibilities TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','paused','closed','archived')),
  public_slug TEXT,
  recruiter_id INTEGER,
  hiring_manager_id INTEGER,
  opened_at TEXT,
  closes_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_org_status ON jobs(org_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_slug ON jobs(org_id, public_slug);

CREATE TABLE IF NOT EXISTS job_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('mandatory','weighted')),
  category TEXT NOT NULL DEFAULT 'technical' CHECK (category IN ('experience','technical','competency','education','other')),
  label TEXT NOT NULL,
  description TEXT,
  weight INTEGER NOT NULL DEFAULT 0,
  keywords TEXT NOT NULL DEFAULT '[]',
  min_years REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_criteria_job ON job_criteria(job_id);

CREATE TABLE IF NOT EXISTS job_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal','hired','rejected','talent_pool'))
);
CREATE INDEX IF NOT EXISTS idx_stages_job ON job_stages(job_id, position);

CREATE TABLE IF NOT EXISTS job_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  changed_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  stage_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hired','rejected','withdrawn','talent_pool')),
  source TEXT NOT NULL DEFAULT 'postulacion',
  owner_id INTEGER,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  rejection_reason TEXT,
  rejection_note TEXT,
  UNIQUE (job_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_apps_org_job ON applications(org_id, job_id);
CREATE INDEX IF NOT EXISTS idx_apps_candidate ON applications(candidate_id);

CREATE TABLE IF NOT EXISTS application_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT,
  action TEXT NOT NULL DEFAULT 'stage_change',
  actor_id INTEGER,
  reason TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_app ON application_events(application_id);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  application_id INTEGER,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','candidate')),
  author_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_candidate ON notes(candidate_id);

CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mcq','written','practical','spreadsheet','manual')),
  job_id INTEGER,
  description TEXT,
  instructions TEXT,
  duration_min INTEGER NOT NULL DEFAULT 30,
  pass_score INTEGER NOT NULL DEFAULT 70,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assessments_org ON assessments(org_id);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'mcq' CHECK (kind IN ('mcq','open')),
  options TEXT NOT NULL DEFAULT '[]',
  correct_index INTEGER,
  points REAL NOT NULL DEFAULT 1,
  rubric TEXT
);
CREATE INDEX IF NOT EXISTS idx_questions_assessment ON assessment_questions(assessment_id);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  application_id INTEGER,
  answers TEXT NOT NULL DEFAULT '{}',
  auto_score REAL,
  max_score REAL,
  final_score REAL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','graded','review_required')),
  reviewer_id INTEGER,
  reviewed_at TEXT,
  reviewer_note TEXT,
  assessment_version INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_candidate ON attempts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_attempts_assessment ON attempts(assessment_id);

CREATE TABLE IF NOT EXISTS interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL,
  job_id INTEGER NOT NULL,
  scheduled_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 45,
  timezone TEXT NOT NULL DEFAULT 'America/Guayaquil',
  mode TEXT NOT NULL DEFAULT 'videollamada',
  interviewer_id INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  meeting_link TEXT,
  guide TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interviews_org ON interviews(org_id, scheduled_at);

CREATE TABLE IF NOT EXISTS scorecards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  interview_id INTEGER NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  author_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scorecards_interview ON scorecards(interview_id);

CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL,
  score REAL,
  coverage REAL,
  mandatory_status TEXT NOT NULL DEFAULT 'falta_verificar',
  factors TEXT NOT NULL DEFAULT '[]',
  explanation TEXT,
  model_version TEXT NOT NULL DEFAULT 'quipu-match-1.0',
  origin TEXT NOT NULL DEFAULT 'on_demand',
  feedback TEXT CHECK (feedback IN ('useful','incorrect')),
  feedback_reason TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recs_job ON recommendations(job_id);

CREATE TABLE IF NOT EXISTS communications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  application_id INTEGER,
  candidate_id INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','whatsapp','phone','in_app')),
  template TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  provider TEXT NOT NULL DEFAULT 'no_configurado',
  provider_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comms_candidate ON communications(candidate_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  actor_id INTEGER,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  result TEXT NOT NULL DEFAULT 'ok',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org_id, created_at);

CREATE TABLE IF NOT EXISTS retention_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('access','rectification','opposition','deletion')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','rejected')),
  detail TEXT,
  resolution TEXT,
  assigned_to INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_retention_org ON retention_requests(org_id, status);

CREATE TABLE IF NOT EXISTS employee_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL,
  period_label TEXT NOT NULL,
  review_type TEXT NOT NULL DEFAULT '90d',
  objectives TEXT,
  result TEXT,
  reviewer_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
