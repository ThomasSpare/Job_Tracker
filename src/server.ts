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
const DB_PATH = process.env.NODE_ENV === 'production' 
  ? path.join(process.cwd(), 'data', 'job_search_db.json')
  : path.join(__dirname, 'job_search_db.json');

// Initialize database
async function initDB() {
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify({ jobs: [] }, null, 2));
  }
}

async function ensureDataDir() {
  if (process.env.NODE_ENV === 'production') {
    const dataDir = path.join(process.cwd(), 'data');
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }
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
    
    res.json({ success: true, jobs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch jobs' });
  }
});

// Get single job
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const db = await readDB();
    const job = db.jobs.find(j => j.id === req.params.id);
    
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    res.json({ success: true, job });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch job' });
  }
});

// Add new job
app.post('/api/jobs', async (req, res) => {
  try {
    const { title, company, location, description, url, salary, experienceLevel } = req.body;
    
    if (!title || !company || !url) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const db = await readDB();
    
    const newJob: Job = {
      id: `job_${Date.now()}`,
      title,
      company,
      location: location || 'Not specified',
      description: description || '',
      url,
      postedDate: new Date().toISOString(),
      salary,
      experienceLevel: experienceLevel || 'mid',
      status: 'new',
    };
    
    db.jobs.unshift(newJob);
    await writeDB(db);
    
    res.json({ success: true, job: newJob });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add job' });
  }
});

// Bulk import jobs
app.post('/api/jobs/bulk', async (req, res) => {
  try {
    const { jobs } = req.body;
    
    if (!jobs || !Array.isArray(jobs)) {
      return res.status(400).json({ success: false, error: 'Invalid jobs array' });
    }

    const db = await readDB();
    
    const newJobs = jobs.map((job: any) => ({
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: job.title,
      company: job.company,
      location: job.location || 'Not specified',
      description: job.description || '',
      url: job.url,
      postedDate: job.postedDate || new Date().toISOString(),
      salary: job.salary,
      experienceLevel: job.experienceLevel || 'mid',
      status: 'new' as const,
    }));

    db.jobs.unshift(...newJobs);
    await writeDB(db);
    
    res.json({ success: true, imported: newJobs.length, jobs: newJobs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to import jobs' });
  }
});

// Update job
app.put('/api/jobs/:id', async (req, res) => {
  try {
    const db = await readDB();
    const jobIndex = db.jobs.findIndex(j => j.id === req.params.id);
    
    if (jobIndex === -1) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    const updates = req.body;
    db.jobs[jobIndex] = { ...db.jobs[jobIndex], ...updates };
    
    // Auto-set appliedDate when status changes to applied
    if (updates.status === 'applied' && !db.jobs[jobIndex].appliedDate) {
      db.jobs[jobIndex].appliedDate = new Date().toISOString();
    }
    
    await writeDB(db);
    
    res.json({ success: true, job: db.jobs[jobIndex] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update job' });
  }
});

// Delete job
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const db = await readDB();
    const jobIndex = db.jobs.findIndex(j => j.id === req.params.id);
    
    if (jobIndex === -1) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    db.jobs.splice(jobIndex, 1);
    await writeDB(db);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete job' });
  }
});

// Search jobs from external API
app.get('/api/search', async (req, res) => {
  try {
    const { query, location } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    // Using JSearch API (you'll need to get a free API key from RapidAPI)
    const apiKey = process.env.RAPIDAPI_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        success: false, 
        error: 'API key not configured. Add RAPIDAPI_KEY to environment variables in Railway.' 
      });
    }

    const params = new URLSearchParams({
      query: query as string,
      page: '1',
      num_pages: '1',
      date_posted: 'week'
    });

    if (location) {
      params.append('location', location as string);
    }

    const response = await fetch(
      `https://jsearch.p.rapidapi.com/search?${params}`,
      {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
        }
      }
    );

    const data = await response.json();
    
    // Transform API response to our format
    const jobs = (data.data || []).map((job: any) => ({
      title: job.job_title,
      company: job.employer_name,
      location: job.job_city ? `${job.job_city}, ${job.job_state || job.job_country}` : 'Remote',
      description: job.job_description || '',
      url: job.job_apply_link || job.job_google_link,
      salary: job.job_salary || job.job_min_salary ? 
        `${job.job_min_salary || ''}-${job.job_max_salary || ''}` : undefined,
      experienceLevel: job.job_required_experience?.no_experience_required ? 'junior' : 'mid',
      postedDate: job.job_posted_at_datetime_utc,
      highlights: job.job_highlights,
      employmentType: job.job_employment_type
    }));

    res.json({ success: true, jobs, total: jobs.length });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Failed to search jobs. Please try again.' });
  }
});

// Extract job requirements
app.get('/api/jobs/:id/requirements', async (req, res) => {
  try {
    const db = await readDB();
    const job = db.jobs.find(j => j.id === req.params.id);
    
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    // Extract technical keywords
    const techKeywords = [
      'React', 'Node.js', 'JavaScript', 'TypeScript', 'Python',
      'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'AWS', 'Azure', 'GCP',
      'Docker', 'Kubernetes', 'Git', 'REST API', 'GraphQL',
      'Express', 'Next.js', 'Vue', 'Angular', 'Redux',
      'HTML', 'CSS', 'Tailwind', 'Bootstrap', 'Jest', 'Testing'
    ];
    
    const foundSkills = techKeywords.filter(skill =>
      job.description.toLowerCase().includes(skill.toLowerCase())
    );
    
    res.json({
      success: true,
      requirements: {
        skills: foundSkills,
        experienceLevel: job.experienceLevel,
        description: job.description
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to extract requirements' });
  }
});

// Prepare Careerflow data
app.get('/api/jobs/:id/careerflow', async (req, res) => {
  try {
    const db = await readDB();
    const job = db.jobs.find(j => j.id === req.params.id);
    
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    const careerflowData = {
      jobTitle: job.title,
      company: job.company,
      location: job.location,
      jobDescription: job.description,
      jobUrl: job.url,
      salaryRange: job.salary || 'Not specified',
    };
    
    res.json({ success: true, data: careerflowData });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to prepare data' });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const db = await readDB();
    
    const stats = {
      total: db.jobs.length,
      new: db.jobs.filter(j => j.status === 'new').length,
      reviewed: db.jobs.filter(j => j.status === 'reviewed').length,
      tailoring: db.jobs.filter(j => j.status === 'tailoring').length,
      applied: db.jobs.filter(j => j.status === 'applied').length,
      interviewing: db.jobs.filter(j => j.status === 'interviewing').length,
      offers: db.jobs.filter(j => j.status === 'offer').length,
      rejected: db.jobs.filter(j => j.status === 'rejected').length,
    };
    
    // Calculate weekly stats
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const weeklyApplications = db.jobs.filter(j =>
      j.appliedDate && new Date(j.appliedDate) >= weekAgo
    ).length;
    
    res.json({
      success: true,
      stats: {
        ...stats,
        weeklyApplications,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Job Tracker API is running' });
});

// Start server
async function start() {
  await ensureDataDir();
  await initDB();
  app.listen(PORT, () => {
    console.log(`🚀 Job Tracker running on port ${PORT}`);
  });
}

start().catch(console.error);