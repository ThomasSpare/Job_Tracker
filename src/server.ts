import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    if (updates.url !== undefined) {
      fields.push(`url = $${paramCount++}`);
      values.push(updates.url);
    }
    if (updates.salary !== undefined) {
      fields.push(`salary = $${paramCount++}`);
      values.push(updates.salary);
    }
    if (updates.experienceLevel !== undefined) {
      fields.push(`experience_level = $${paramCount++}`);
      values.push(updates.experienceLevel);
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
    const { query, location, source, limit } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const searchSource = source || 'remoteok';
    const maxResults = parseInt(limit as string) || 20;
    let jobs: any[] = [];

    // RemoteOK API (Free, no auth required) - BEST FOR REMOTE/EUROPE
    if (searchSource === 'remoteok') {
      const response = await fetch('https://remoteok.com/api');
      const data = await response.json();
      
      // Filter by query keywords
      const keywords = (query as string).toLowerCase().split(' ');
      const filtered = data.filter((job: any) => {
        if (!job.position) return false;
        const tags = job.tags ? job.tags.join(' ') : '';
        const text = `${job.position} ${job.description || ''} ${tags} ${job.company || ''}`.toLowerCase();
        
        // Check if matches query
        const matchesQuery = keywords.some(keyword => text.includes(keyword));
        if (!matchesQuery) return false;
        
        // If location specified, filter by it
        if (location) {
          const loc = (job.location || '').toLowerCase();
          const searchLoc = (location as string).toLowerCase();
          
          // Support Europe/European filtering
          if (searchLoc.includes('europe') || searchLoc.includes('eu')) {
            const europeanCountries = ['uk', 'gb', 'germany', 'de', 'france', 'fr', 'netherlands', 'nl', 
              'spain', 'es', 'italy', 'it', 'poland', 'pl', 'portugal', 'pt', 'sweden', 'se', 
              'norway', 'no', 'denmark', 'dk', 'finland', 'fi', 'austria', 'at', 'belgium', 'be',
              'switzerland', 'ch', 'ireland', 'ie', 'europe'];
            return europeanCountries.some(country => loc.includes(country));
          }
          
          return loc.includes(searchLoc);
        }
        
        return true;
      }).slice(0, maxResults);
      
      jobs = filtered.map((job: any) => ({
        title: job.position,
        company: job.company,
        location: job.location || 'Worldwide Remote',
        description: job.description || '',
        url: job.url,
        salary: job.salary_max ? `$${job.salary_min || 0}-${job.salary_max}` : undefined,
        experienceLevel: 'mid',
        postedDate: job.date,
        source: 'RemoteOK'
      }));
    }
    
    // JSearch API (RapidAPI) - US FOCUSED
    else if (searchSource === 'jsearch') {
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
        num_pages: Math.ceil(maxResults / 10).toString(),
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
      
      jobs = (data.data || []).slice(0, maxResults).map((job: any) => {
        let salary = undefined;
        if (job.job_salary) {
          salary = job.job_salary;
        } else if (job.job_min_salary || job.job_max_salary) {
          salary = `$${job.job_min_salary || ''}-${job.job_max_salary || ''}`;
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
    
    // Adzuna API (Europe-focused) - BEST FOR SPECIFIC EUROPEAN COUNTRIES
    else if (searchSource === 'adzuna') {
      const appId = process.env.ADZUNA_APP_ID;
      const appKey = process.env.ADZUNA_APP_KEY;
      
      if (!appId || !appKey) {
        return res.status(500).json({
          success: false,
          error: 'Adzuna API credentials not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to environment variables.'
        });
      }
      
      // Determine country from location
      let country = 'de'; // Default Germany
      if (location) {
        const loc = (location as string).toLowerCase();
        if (loc.includes('uk') || loc.includes('britain') || loc.includes('england')) country = 'gb';
        else if (loc.includes('france')) country = 'fr';
        else if (loc.includes('netherlands') || loc.includes('dutch')) country = 'nl';
        else if (loc.includes('spain')) country = 'es';
        else if (loc.includes('italy')) country = 'it';
        else if (loc.includes('poland')) country = 'pl';
        else if (loc.includes('portugal')) country = 'pt';
        else if (loc.includes('sweden')) country = 'se';
        else if (loc.includes('austria')) country = 'at';
        else if (loc.includes('belgium')) country = 'be';
        else if (loc.includes('switzerland')) country = 'ch';
        else if (loc.includes('ireland')) country = 'ie';
      }
      
      const resultsPerPage = Math.min(maxResults, 50); // Adzuna max is 50
      
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: resultsPerPage.toString(),
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

// AI Job Matching - Score jobs based on profile
app.post('/api/match-jobs', async (req, res) => {
  try {
    const { jobs, profile } = req.body;
    
    if (!jobs || !Array.isArray(jobs)) {
      return res.status(400).json({ success: false, error: 'Jobs array required' });
    }
    
    if (!profile || !profile.skills) {
      return res.status(400).json({ success: false, error: 'Profile with skills required' });
    }
    
    // Score each job
    const scoredJobs = jobs.map(job => {
      const score = calculateJobScore(job, profile);
      return {
        ...job,
        matchScore: score.total,
        matchDetails: score.breakdown,
        hireProbability: score.hireProbability,
        reasoning: score.reasoning
      };
    });
    
    // Sort by match score (highest first)
    scoredJobs.sort((a, b) => b.matchScore - a.matchScore);
    
    res.json({ success: true, jobs: scoredJobs });
  } catch (error) {
    console.error('Error matching jobs:', error);
    res.status(500).json({ success: false, error: 'Failed to match jobs' });
  }
});

// Calculate job match score
function calculateJobScore(job: any, profile: any) {
  let skillScore = 0;
  let recencyScore = 0;
  let hireProbabilityScore = 0;
  let experienceScore = 0;
  
  const reasoning = [];
  
  // 1. Skills Match (40 points max)
  const userSkills = profile.skills.map((s: string) => s.toLowerCase());
  const jobText = `${job.title} ${job.description} ${job.company}`.toLowerCase();
  
  let matchedSkills = 0;
  const foundSkills: string[] = [];
  
  userSkills.forEach((skill: string) => {
    if (jobText.includes(skill)) {
      matchedSkills++;
      foundSkills.push(skill);
    }
  });
  
  skillScore = Math.min(40, (matchedSkills / userSkills.length) * 40);
  
  if (matchedSkills > 0) {
    reasoning.push(`Matches ${matchedSkills}/${userSkills.length} of your skills: ${foundSkills.join(', ')}`);
  }
  
  // 2. Recency (25 points max)
  if (job.postedDate) {
    const posted = new Date(job.postedDate);
    const now = new Date();
    const daysAgo = Math.floor((now.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysAgo <= 1) {
      recencyScore = 25;
      reasoning.push('Posted today - fresh opportunity!');
    } else if (daysAgo <= 3) {
      recencyScore = 20;
      reasoning.push(`Posted ${daysAgo} days ago - very recent`);
    } else if (daysAgo <= 7) {
      recencyScore = 15;
      reasoning.push(`Posted ${daysAgo} days ago - recent`);
    } else if (daysAgo <= 14) {
      recencyScore = 10;
      reasoning.push(`Posted ${daysAgo} days ago`);
    } else {
      recencyScore = 5;
      reasoning.push(`Posted ${daysAgo} days ago - older posting`);
    }
  }
  
  // 3. Experience Level Match (20 points max)
  const userLevel = profile.experienceLevel || 'mid';
  const jobLevel = job.experienceLevel || 'mid';
  
  if (userLevel === jobLevel) {
    experienceScore = 20;
    reasoning.push(`Perfect experience level match (${jobLevel})`);
  } else if (
    (userLevel === 'mid' && jobLevel === 'junior') ||
    (userLevel === 'senior' && jobLevel === 'mid')
  ) {
    experienceScore = 15;
    reasoning.push('Slight overqualified - good for career growth');
  } else if (
    (userLevel === 'junior' && jobLevel === 'mid') ||
    (userLevel === 'mid' && jobLevel === 'senior')
  ) {
    experienceScore = 10;
    reasoning.push('Stretch role - challenging opportunity');
  } else {
    experienceScore = 5;
    reasoning.push('Experience level mismatch');
  }
  
  // 4. Hire Probability Signals (15 points max)
  let hiringSignals = 0;
  
  // Check for urgent hiring signals
  const urgentKeywords = ['urgent', 'immediate', 'asap', 'hiring now', 'start immediately'];
  if (urgentKeywords.some(keyword => jobText.includes(keyword))) {
    hiringSignals += 5;
    reasoning.push('Urgent hiring - higher chance');
  }
  
  // Check for junior-friendly signals
  const juniorFriendly = ['junior', 'entry level', 'mentorship', 'training provided', 'will train'];
  if (juniorFriendly.some(keyword => jobText.includes(keyword))) {
    hiringSignals += 3;
    reasoning.push('Junior-friendly environment');
  }
  
  // Check for remote-friendly company
  if (job.location && (job.location.toLowerCase().includes('remote') || job.location.toLowerCase().includes('worldwide'))) {
    hiringSignals += 3;
    reasoning.push('Fully remote - broader candidate pool');
  }
  
  // Check for startup (often hire faster)
  const startupKeywords = ['startup', 'scale-up', 'fast-growing', 'seed', 'series a'];
  if (startupKeywords.some(keyword => jobText.includes(keyword))) {
    hiringSignals += 2;
    reasoning.push('Startup - potentially faster hiring');
  }
  
  // Small company indicator
  const smallCompanyKeywords = ['small team', '5-10 people', 'small company', 'tight-knit'];
  if (smallCompanyKeywords.some(keyword => jobText.includes(keyword))) {
    hiringSignals += 2;
    reasoning.push('Small team - direct impact');
  }
  
  hireProbabilityScore = Math.min(15, hiringSignals);
  
  // Calculate total
  const total = Math.round(skillScore + recencyScore + experienceScore + hireProbabilityScore);
  
  // Calculate hire probability (0-100%)
  const hireProbability = Math.min(100, Math.round(
    (skillScore / 40) * 40 +
    (recencyScore / 25) * 25 +
    (experienceScore / 20) * 20 +
    (hireProbabilityScore / 15) * 15
  ));
  
  return {
    total,
    breakdown: {
      skills: Math.round(skillScore),
      recency: Math.round(recencyScore),
      experience: Math.round(experienceScore),
      signals: Math.round(hireProbabilityScore)
    },
    hireProbability,
    reasoning: reasoning.slice(0, 3) // Top 3 reasons
  };
}

// Get or create user profile
app.get('/api/profile', async (req, res) => {
  try {
    // For now, return a default profile structure
    // In production, this would be stored in database per user
    const defaultProfile = {
      skills: [],
      experienceLevel: 'mid',
      preferredLocations: [],
      salaryMin: null,
      bio: ''
    };
    
    res.json({ success: true, profile: defaultProfile });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

// Save user profile
app.post('/api/profile', async (req, res) => {
  try {
    const profile = req.body;
    
    // In production, save to database
    // For now, just return success
    
    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save profile' });
  }
});

// GitHub Jobs Search - DEPRECATED, using alternative scraping
app.get('/api/search/github', async (req, res) => {
  try {
    res.status(503).json({ 
      success: false, 
      error: 'GitHub Jobs API is no longer available. Try RemoteOK or Adzuna instead for tech jobs.' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'GitHub Jobs is deprecated. Use RemoteOK for tech positions.' 
    });
  }
});

// WeWorkRemotely Jobs Search (alternative to GitHub Jobs)
app.get('/api/search/weworkremotely', async (req, res) => {
  try {
    const { query, limit } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }
    
    const maxResults = parseInt(limit as string) || 20;
    
    // WeWorkRemotely doesn't have a public API, but RemoteOK is a good alternative
    // Redirect to RemoteOK for now
    res.json({ 
      success: false, 
      error: 'WeWorkRemotely does not have a public API. Please use RemoteOK which has similar tech jobs.',
      suggestion: 'Use RemoteOK source instead - it has many remote tech positions!'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'WeWorkRemotely search unavailable. Use RemoteOK instead.' 
    });
  }
});

// Company Website Scraper
app.post('/api/search/company', async (req, res) => {
  try {
    const { companyName, careerPageUrl, keywords } = req.body;
    
    if (!companyName || !careerPageUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Company name and career page URL are required' 
      });
    }

    console.log(`Scraping ${companyName} careers page: ${careerPageUrl}`);

    // Fetch the career page
    const response = await fetch(careerPageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch career page: ${response.status}`);
    }

    const html = await response.text();
    
    // Parse jobs from HTML
    const jobs = parseCareerPage(html, companyName, careerPageUrl, keywords);
    
    res.json({ 
      success: true, 
      jobs, 
      total: jobs.length, 
      source: `${companyName} Careers`,
      scrapedUrl: careerPageUrl
    });
  } catch (error) {
    console.error('Company scraping error:', error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to scrape company page. The website may block automated access or have a different structure. Error: ${error}` 
    });
  }
});

// Parse career page HTML
function parseCareerPage(html: string, companyName: string, baseUrl: string, keywords?: string): any[] {
  const jobs: any[] = [];
  
  try {
    // Common patterns for job listings on career pages
    const patterns = [
      // Pattern 1: Look for common job-related keywords in text
      {
        titleRegex: /<[^>]*>((?:Senior|Junior|Mid-Level|Staff)?\s*(?:Software|Full\s*Stack|Front\s*End|Back\s*End|DevOps|Data|ML|AI)\s*(?:Engineer|Developer|Architect)[^<]*)<\/[^>]*>/gi,
        linkRegex: /<a[^>]+href=["']([^"']+)["'][^>]*>.*?(?:apply|view|details|learn more).*?<\/a>/gi
      },
      // Pattern 2: Job titles with links
      {
        titleRegex: /<(?:h[1-6]|div|span)[^>]*class=["'][^"']*(?:job|position|role|title)[^"']*["'][^>]*>([^<]+)<\/(?:h[1-6]|div|span)>/gi,
        linkRegex: null
      },
      // Pattern 3: List items that might be jobs
      {
        titleRegex: /<li[^>]*>.*?<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>.*?<\/li>/gi,
        linkRegex: null
      }
    ];

    // Extract all links and surrounding text
    const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/a>/gi;
    let match;
    
    while ((match = linkPattern.exec(html)) !== null) {
      const url = match[1];
      const linkText = match[2].replace(/<[^>]+>/g, '').trim();
      
      // Check if this looks like a job posting
      const jobKeywords = ['engineer', 'developer', 'designer', 'manager', 'analyst', 
                          'architect', 'lead', 'senior', 'junior', 'intern', 'fullstack',
                          'frontend', 'backend', 'devops', 'data', 'ml', 'ai', 'product'];
      
      const isJobLink = jobKeywords.some(keyword => 
        linkText.toLowerCase().includes(keyword) ||
        url.toLowerCase().includes(keyword) ||
        url.toLowerCase().includes('job') ||
        url.toLowerCase().includes('career') ||
        url.toLowerCase().includes('position')
      );
      
      if (isJobLink && linkText.length > 10 && linkText.length < 150) {
        // If keywords provided, filter by them
        if (keywords) {
          const searchTerms = keywords.toLowerCase().split(' ');
          const matchesKeywords = searchTerms.some(term => 
            linkText.toLowerCase().includes(term)
          );
          if (!matchesKeywords) continue;
        }
        
        // Construct full URL
        let fullUrl = url;
        if (url.startsWith('/')) {
          const urlObj = new URL(baseUrl);
          fullUrl = `${urlObj.protocol}//${urlObj.host}${url}`;
        } else if (!url.startsWith('http')) {
          fullUrl = new URL(url, baseUrl).href;
        }
        
        jobs.push({
          title: linkText,
          company: companyName,
          location: 'See job posting',
          description: `Found on ${companyName} careers page`,
          url: fullUrl,
          salary: null,
          experienceLevel: determineExperienceLevel(linkText),
          postedDate: new Date().toISOString(),
          source: `${companyName} Careers`
        });
      }
    }
    
    // If we found very few or no jobs, try alternative parsing
    if (jobs.length < 3) {
      // Look for JSON-LD structured data (many modern sites use this)
      const jsonLdPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
      let jsonMatch;
      
      while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
        try {
          const jsonData = JSON.parse(jsonMatch[1]);
          if (jsonData['@type'] === 'JobPosting' || 
              (Array.isArray(jsonData) && jsonData.some((item: any) => item['@type'] === 'JobPosting'))) {
            
            const jobPostings = Array.isArray(jsonData) ? jsonData : [jsonData];
            
            jobPostings.forEach((posting: any) => {
              if (posting['@type'] === 'JobPosting') {
                jobs.push({
                  title: posting.title || posting.name || 'Position',
                  company: companyName,
                  location: posting.jobLocation?.address?.addressLocality || 'See job posting',
                  description: (posting.description || '').substring(0, 500),
                  url: posting.url || baseUrl,
                  salary: posting.baseSalary?.value?.value || null,
                  experienceLevel: 'mid',
                  postedDate: posting.datePosted || new Date().toISOString(),
                  source: `${companyName} Careers`
                });
              }
            });
          }
        } catch (e) {
          // Invalid JSON, continue
        }
      }
    }
    
    // Remove duplicates based on title
    const uniqueJobs = jobs.filter((job, index, self) =>
      index === self.findIndex((j) => j.title === job.title && j.url === job.url)
    );
    
    return uniqueJobs;
  } catch (error) {
    console.error('Error parsing career page:', error);
    return [];
  }
}

// Determine experience level from job title
function determineExperienceLevel(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('senior') || lower.includes('lead') || lower.includes('staff') || lower.includes('principal')) {
    return 'senior';
  } else if (lower.includes('junior') || lower.includes('entry') || lower.includes('intern')) {
    return 'junior';
  }
  return 'mid';
}

// Start server
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`🚀 Job Tracker running on port ${PORT}`);
  });
}

start().catch(console.error);