import express from 'express';
import cors from 'cors';
import pg from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const { Pool } = pg;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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

// Initialize database
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        company VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        description TEXT,
        url TEXT NOT NULL,
        posted_date TIMESTAMP,
        salary VARCHAR(100),
        experience_level VARCHAR(50),
        status VARCHAR(50) DEFAULT 'new',
        applied_date TIMESTAMP,
        next_action TEXT,
        next_action_date TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// API Routes

// Get all jobs
app.get('/api/jobs', async (req, res) => {
  try {
    const status = req.query.status as string;
    
    let query = 'SELECT * FROM jobs ORDER BY created_at DESC';
    let params: any[] = [];
    
    if (status && status !== 'all') {
      query = 'SELECT * FROM jobs WHERE status = $1 ORDER BY created_at DESC';
      params = [status];
    }
    
    const result = await pool.query(query, params);
    
    const jobs = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      description: row.description,
      url: row.url,
      postedDate: row.posted_date,
      salary: row.salary,
      experienceLevel: row.experience_level,
      status: row.status,
      appliedDate: row.applied_date,
      nextAction: row.next_action,
      nextActionDate: row.next_action_date,
      notes: row.notes
    }));
    
    res.json({ success: true, jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch jobs' });
  }
});

// Get single job
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    const row = result.rows[0];
    const job = {
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      description: row.description,
      url: row.url,
      postedDate: row.posted_date,
      salary: row.salary,
      experienceLevel: row.experience_level,
      status: row.status,
      appliedDate: row.applied_date,
      nextAction: row.next_action,
      nextActionDate: row.next_action_date,
      notes: row.notes
    };
    
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
    
    const id = `job_${Date.now()}`;
    
    await pool.query(
      `INSERT INTO jobs (id, title, company, location, description, url, posted_date, salary, experience_level, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        title,
        company,
        location || 'Not specified',
        description || '',
        url,
        new Date().toISOString(),
        salary,
        experienceLevel || 'mid',
        'new'
      ]
    );
    
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
    const row = result.rows[0];
    
    const newJob = {
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      description: row.description,
      url: row.url,
      postedDate: row.posted_date,
      salary: row.salary,
      experienceLevel: row.experience_level,
      status: row.status
    };
    
    res.json({ success: true, job: newJob });
  } catch (error) {
    console.error('Error adding job:', error);
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

    const insertedJobs = [];
    
    for (const job of jobs) {
      const id = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await pool.query(
        `INSERT INTO jobs (id, title, company, location, description, url, posted_date, salary, experience_level, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          job.title,
          job.company,
          job.location || 'Not specified',
          job.description || '',
          job.url,
          job.postedDate || new Date().toISOString(),
          job.salary,
          job.experienceLevel || 'mid',
          'new'
        ]
      );
      
      insertedJobs.push({ id, ...job });
    }
    
    res.json({ success: true, imported: insertedJobs.length, jobs: insertedJobs });
  } catch (error) {
    console.error('Error importing jobs:', error);
    res.status(500).json({ success: false, error: 'Failed to import jobs' });
  }
});

// Update job
app.put('/api/jobs/:id', async (req, res) => {
  try {
    const updates = req.body;
    const id = req.params.id;
    
    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    if (updates.title) {
      fields.push(`title = $${paramCount++}`);
      values.push(updates.title);
    }
    if (updates.company) {
      fields.push(`company = $${paramCount++}`);
      values.push(updates.company);
    }
    if (updates.location !== undefined) {
      fields.push(`location = $${paramCount++}`);
      values.push(updates.location);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }
    if (updates.status) {
      fields.push(`status = $${paramCount++}`);
      values.push(updates.status);
      
      // Auto-set appliedDate when status changes to applied
      if (updates.status === 'applied') {
        fields.push(`applied_date = $${paramCount++}`);
        values.push(new Date().toISOString());
      }
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(updates.notes);
    }
    if (updates.nextAction !== undefined) {
      fields.push(`next_action = $${paramCount++}`);
      values.push(updates.nextAction);
    }
    if (updates.nextActionDate !== undefined) {
      fields.push(`next_action_date = $${paramCount++}`);
      values.push(updates.nextActionDate);
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    values.push(id);
    const query = `UPDATE jobs SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    const row = result.rows[0];
    const job = {
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      description: row.description,
      url: row.url,
      postedDate: row.posted_date,
      salary: row.salary,
      experienceLevel: row.experience_level,
      status: row.status,
      appliedDate: row.applied_date,
      nextAction: row.next_action,
      nextActionDate: row.next_action_date,
      notes: row.notes
    };
    
    res.json({ success: true, job });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ success: false, error: 'Failed to update job' });
  }
});

// Delete job
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM jobs WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete job' });
  }
});

// Search jobs from external APIs
app.get('/api/search', async (req, res) => {
  try {
    const { query, location, source } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const searchSource = source || 'jsearch';
    let jobs: any[] = [];

    // JSearch API (RapidAPI)
    if (searchSource === 'jsearch') {
      const apiKey = process.env.RAPIDAPI_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          success: false, 
          error: 'RAPIDAPI_KEY not configured. Add it to Railway environment variables.' 
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
      
      jobs = (data.data || []).map((job: any) => {
        let salary = undefined;
        if (job.job_salary) {
          salary = job.job_salary;
        } else if (job.job_min_salary || job.job_max_salary) {
          salary = `${job.job_min_salary || ''}-${job.job_max_salary || ''}`;
        }
        
        const experienceLevel = job.job_required_experience && 
          job.job_required_experience.no_experience_required ? 'junior' : 'mid';
        
        return {
          title: job.job_title,
          company: job.employer_name,
          location: job.job_city ? `${job.job_city}, ${job.job_state || job.job_country}` : 'Remote',
          description: job.job_description || '',
          url: job.job_apply_link || job.job_google_link,
          salary: salary,
          experienceLevel: experienceLevel,
          postedDate: job.job_posted_at_datetime_utc,
          source: 'JSearch'
        };
      });
    }
    
    // RemoteOK API (Free, no auth required)
    else if (searchSource === 'remoteok') {
      const response = await fetch('https://remoteok.com/api');
      const data = await response.json();
      
      // Filter by query keywords
      const keywords = (query as string).toLowerCase().split(' ');
      const filtered = data.filter((job: any) => {
        if (!job.position) return false;
        const tags = job.tags ? job.tags.join(' ') : '';
        const text = `${job.position} ${job.description || ''} ${tags}`.toLowerCase();
        return keywords.some(keyword => text.includes(keyword));
      }).slice(0, 20);
      
      jobs = filtered.map((job: any) => ({
        title: job.position,
        company: job.company,
        location: job.location || 'Remote',
        description: job.description || '',
        url: job.url,
        salary: job.salary_max ? `$${job.salary_min || 0}-${job.salary_max}` : undefined,
        experienceLevel: 'mid',
        postedDate: job.date,
        source: 'RemoteOK'
      }));
    }
    
    // Adzuna API (Europe-focused)
    else if (searchSource === 'adzuna') {
      const appId = process.env.ADZUNA_APP_ID;
      const appKey = process.env.ADZUNA_APP_KEY;
      
      if (!appId || !appKey) {
        return res.status(500).json({
          success: false,
          error: 'Adzuna API credentials not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to environment variables.'
        });
      }
      
      const country = (location as string)?.toLowerCase().includes('uk') ? 'gb' : 
                     (location as string)?.toLowerCase().includes('france') ? 'fr' :
                     (location as string)?.toLowerCase().includes('netherlands') ? 'nl' : 'de';
      
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: '20',
        what: query as string
      });
      
      params.append('content-type', 'application/json');
      
      const response = await fetch(
        `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`
      );
      
      const data = await response.json();
      
      jobs = (data.results || []).map((job: any) => ({
        title: job.title,
        company: job.company.display_name,
        location: `${job.location.display_name}, ${country.toUpperCase()}`,
        description: job.description || '',
        url: job.redirect_url,
        salary: job.salary_max ? `€${Math.round(job.salary_min || 0)}-${Math.round(job.salary_max)}` : undefined,
        experienceLevel: 'mid',
        postedDate: job.created,
        source: 'Adzuna'
      }));
    }
    
    else if (searchSource === 'weworkremotely') {
      return res.json({
        success: false,
        error: 'WeWorkRemotely integration coming soon. Use RemoteOK or Adzuna for now.'
      });
    }

    res.json({ success: true, jobs, total: jobs.length, source: searchSource });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Failed to search jobs. Please try again.' });
  }
});

// Extract job requirements
app.get('/api/jobs/:id/requirements', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    const job = result.rows[0];
    
    const techKeywords = [
      'React', 'Node.js', 'JavaScript', 'TypeScript', 'Python',
      'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'AWS', 'Azure', 'GCP',
      'Docker', 'Kubernetes', 'Git', 'REST API', 'GraphQL',
      'Express', 'Next.js', 'Vue', 'Angular', 'Redux',
      'HTML', 'CSS', 'Tailwind', 'Bootstrap', 'Jest', 'Testing'
    ];
    
    const foundSkills = techKeywords.filter(skill =>
      job.description && job.description.toLowerCase().includes(skill.toLowerCase())
    );
    
    res.json({
      success: true,
      requirements: {
        skills: foundSkills,
        experienceLevel: job.experience_level,
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
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    
    const job = result.rows[0];
    
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
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM jobs');
    const statusResults = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM jobs 
      GROUP BY status
    `);
    
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const weeklyResult = await pool.query(
      'SELECT COUNT(*) as count FROM jobs WHERE applied_date >= $1',
      [weekAgo.toISOString()]
    );
    
    const stats: any = {
      total: parseInt(totalResult.rows[0].count),
      new: 0,
      reviewed: 0,
      tailoring: 0,
      applied: 0,
      interviewing: 0,
      offers: 0,
      rejected: 0
    };
    
    statusResults.rows.forEach(row => {
      stats[row.status] = parseInt(row.count);
    });
    
    const weeklyApplications = parseInt(weeklyResult.rows[0].count);
    
    res.json({
      success: true,
      stats: {
        ...stats,
        weeklyApplications,
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Job Tracker API is running' });
});

// Start server
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`🚀 Job Tracker running on port ${PORT}`);
  });
}

start().catch(console.error);