import express from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Job data structure
interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  postedDate: string;
  salary?: string;
  experienceLevel: string;
  status: "new" | "reviewed" | "tailoring" | "applied" | "interviewing" | "rejected" | "offer";
  appliedDate?: string;
  nextAction?: string;
  nextActionDate?: string;
  notes?: string;
}

// Database file path
const DB_PATH = path.join(__dirname, 'job_search_db.json');

// Initialize database
async function initDB() {
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify({ jobs: [] }, null, 2));
  }
}

// Read database
async function readDB(): Promise<{ jobs: Job[] }> {
  const data = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(data);
}

// Write database
async function writeDB(data: { jobs: Job[] }) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

// API Routes

// Get all jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const db = await readDB();
    const status = req.query.status as string;
    
    let jobs = db.jobs;
    if (status && status !== 'all') {
      jobs = jobs.filter(j => j.status === status);
    }
    
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get single job
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const db = await readDB();
    const job = db.jobs.find(j => j.id === req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Add new job
app.post('/api/jobs', async (req, res) => {
  try {
    const db = await readDB();
    
    const newJob: Job = {
      id: `job_${Date.now()}`,
      title: req.body.title,
      company: req.body.company,
      location: req.body.location || 'Not specified',
      description: req.body.description || '',
      url: req.body.url,
      postedDate: new Date().toISOString(),
      salary: req.body.salary,
      experienceLevel: req.body.experienceLevel || 'mid',
      status: 'new',
    };
    
    db.jobs.push(newJob);
    await writeDB(db);
    
    res.status(201).json(newJob);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add job' });
  }
});

// Update job
app.put('/api/jobs/:id', async (req, res) => {
  try {
    const db = await readDB();
    const jobIndex = db.jobs.findIndex(j => j.id === req.params.id);
    
    if (jobIndex === -1) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const updatedJob = {
      ...db.jobs[jobIndex],
      ...req.body,
    };
    
    // Auto-set appliedDate when status changes to applied
    if (req.body.status === 'applied' && !updatedJob.appliedDate) {
      updatedJob.appliedDate = new Date().toISOString();
    }
    
    db.jobs[jobIndex] = updatedJob;
    await writeDB(db);
    
    res.json(updatedJob);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete job
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const db = await readDB();
    const jobIndex = db.jobs.findIndex(j => j.id === req.params.id);
    
    if (jobIndex === -1) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    db.jobs.splice(jobIndex, 1);
    await writeDB(db);
    
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const db = await readDB();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const stats = {
      total: db.jobs.length,
      new: db.jobs.filter(j => j.status === 'new').length,
      reviewed: db.jobs.filter(j => j.status === 'reviewed').length,
      tailoring: db.jobs.filter(j => j.status === 'tailoring').length,
      applied: db.jobs.filter(j => j.status === 'applied').length,
      interviewing: db.jobs.filter(j => j.status === 'interviewing').length,
      offers: db.jobs.filter(j => j.status === 'offer').length,
      rejected: db.jobs.filter(j => j.status === 'rejected').length,
      appliedThisWeek: db.jobs.filter(j => 
        j.appliedDate && new Date(j.appliedDate) >= weekAgo
      ).length,
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Extract job requirements (simple keyword extraction)
app.get('/api/jobs/:id/requirements', async (req, res) => {
  try {
    const db = await readDB();
    const job = db.jobs.find(j => j.id === req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const techKeywords = [
      'React', 'Node.js', 'JavaScript', 'TypeScript', 'Python',
      'SQL', 'MongoDB', 'PostgreSQL', 'AWS', 'Docker', 'Git',
      'REST API', 'GraphQL', 'Express', 'Next.js', 'Vue', 'Angular',
      'Redux', 'HTML', 'CSS', 'Tailwind', 'Bootstrap', 'Jest',
      'CI/CD', 'Kubernetes', 'Redis', 'Microservices'
    ];
    
    const foundSkills = techKeywords.filter(skill => 
      job.description.toLowerCase().includes(skill.toLowerCase())
    );
    
    res.json({
      job: {
        title: job.title,
        company: job.company,
        experienceLevel: job.experienceLevel,
      },
      skills: foundSkills,
      description: job.description,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to extract requirements' });
  }
});

// Prepare Careerflow data
app.get('/api/jobs/:id/careerflow', async (req, res) => {
  try {
    const db = await readDB();
    const job = db.jobs.find(j => j.id === req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const careerflowData = {
      jobTitle: job.title,
      company: job.company,
      location: job.location,
      jobDescription: job.description,
      jobUrl: job.url,
      salaryRange: job.salary || 'Not specified',
    };
    
    res.json(careerflowData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to prepare Careerflow data' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize and start server
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Job Tracker API running on port ${PORT}`);
    console.log(`Access at: http://localhost:${PORT}`);
  });
}

start().catch(console.error);