import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import * as fs from "fs/promises";
import * as path from "path";

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
const DB_PATH = path.join(process.cwd(), "job_search_db.json");

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
  const data = await fs.readFile(DB_PATH, "utf-8");
  return JSON.parse(data);
}

// Write database
async function writeDB(data: { jobs: Job[] }) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

// Create MCP server
const server = new Server(
  {
    name: "job-search-tracker",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_jobs",
        description: "Search for jobs on various job boards (LinkedIn, Indeed, GitHub). Filters by keywords, location, and experience level.",
        inputSchema: {
          type: "object",
          properties: {
            keywords: {
              type: "string",
              description: "Job search keywords (e.g., 'fullstack developer', 'react node')",
            },
            location: {
              type: "string",
              description: "Job location (e.g., 'Remote', 'New York', 'San Francisco')",
            },
            experienceLevel: {
              type: "string",
              description: "Experience level: junior, mid, senior",
              enum: ["junior", "mid", "senior"],
            },
          },
          required: ["keywords"],
        },
      },
      {
        name: "add_job",
        description: "Manually add a job to the tracking system",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            company: { type: "string" },
            location: { type: "string" },
            description: { type: "string" },
            url: { type: "string" },
            salary: { type: "string" },
            experienceLevel: { type: "string" },
          },
          required: ["title", "company", "url"],
        },
      },
      {
        name: "update_job_status",
        description: "Update the status of a job application",
        inputSchema: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            status: {
              type: "string",
              enum: ["new", "reviewed", "tailoring", "applied", "interviewing", "rejected", "offer"],
            },
            notes: { type: "string" },
            nextAction: { type: "string" },
            nextActionDate: { type: "string" },
          },
          required: ["jobId", "status"],
        },
      },
      {
        name: "list_jobs",
        description: "List jobs filtered by status",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["all", "new", "reviewed", "tailoring", "applied", "interviewing", "rejected", "offer"],
            },
            limit: { type: "number" },
          },
        },
      },
      {
        name: "extract_job_requirements",
        description: "Extract key requirements and skills from a job description",
        inputSchema: {
          type: "object",
          properties: {
            jobId: { type: "string" },
          },
          required: ["jobId"],
        },
      },
      {
        name: "prepare_careerflow_data",
        description: "Prepare job data formatted for manual input into Careerflow AI",
        inputSchema: {
          type: "object",
          properties: {
            jobId: { type: "string" },
          },
          required: ["jobId"],
        },
      },
      {
        name: "get_weekly_report",
        description: "Generate a weekly job search progress report",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  await initDB();
  const db = await readDB();

  switch (name) {
    case "search_jobs": {
      // In production, integrate with actual job board APIs
      // For now, returning a mock structure
      const mockJobs: Job[] = [
        {
          id: `job_${Date.now()}_1`,
          title: `Fullstack Developer - ${args.keywords}`,
          company: "Tech Company Inc",
          location: args.location || "Remote",
          description: `Looking for a talented fullstack developer with experience in React, Node.js, and modern web technologies...`,
          url: "https://example.com/job/1",
          postedDate: new Date().toISOString(),
          experienceLevel: args.experienceLevel || "mid",
          status: "new",
        },
      ];

      return {
        content: [
          {
            type: "text",
            text: `Found ${mockJobs.length} jobs matching your criteria.\n\n` +
                  `NOTE: This is a mock response. To get real job data, you'll need to:\n` +
                  `1. Integrate with job board APIs (LinkedIn, Indeed, GitHub Jobs)\n` +
                  `2. Or use web scraping libraries like Puppeteer\n` +
                  `3. Add API keys to your configuration\n\n` +
                  `Mock Results:\n${JSON.stringify(mockJobs, null, 2)}`,
          },
        ],
      };
    }

    case "add_job": {
      const newJob: Job = {
        id: `job_${Date.now()}`,
        title: args.title,
        company: args.company,
        location: args.location || "Not specified",
        description: args.description || "",
        url: args.url,
        postedDate: new Date().toISOString(),
        salary: args.salary,
        experienceLevel: args.experienceLevel || "mid",
        status: "new",
      };

      db.jobs.push(newJob);
      await writeDB(db);

      return {
        content: [
          {
            type: "text",
            text: `Job added successfully!\n\nJob ID: ${newJob.id}\nTitle: ${newJob.title}\nCompany: ${newJob.company}`,
          },
        ],
      };
    }

    case "update_job_status": {
      const job = db.jobs.find((j) => j.id === args.jobId);
      if (!job) {
        throw new Error(`Job with ID ${args.jobId} not found`);
      }

      job.status = args.status;
      if (args.notes) job.notes = args.notes;
      if (args.nextAction) job.nextAction = args.nextAction;
      if (args.nextActionDate) job.nextActionDate = args.nextActionDate;
      if (args.status === "applied" && !job.appliedDate) {
        job.appliedDate = new Date().toISOString();
      }

      await writeDB(db);

      return {
        content: [
          {
            type: "text",
            text: `Job status updated!\n\n${job.title} at ${job.company}\nStatus: ${job.status}`,
          },
        ],
      };
    }

    case "list_jobs": {
      const status = args.status || "all";
      const limit = args.limit || 50;
      
      let filteredJobs = status === "all" 
        ? db.jobs 
        : db.jobs.filter((j) => j.status === status);
      
      filteredJobs = filteredJobs.slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: `Found ${filteredJobs.length} jobs${status !== "all" ? ` with status: ${status}` : ""}\n\n` +
                  filteredJobs.map((j, i) => 
                    `${i + 1}. ${j.title} at ${j.company}\n` +
                    `   Status: ${j.status}\n` +
                    `   Location: ${j.location}\n` +
                    `   ID: ${j.id}\n` +
                    `   URL: ${j.url}\n`
                  ).join("\n"),
          },
        ],
      };
    }

    case "extract_job_requirements": {
      const job = db.jobs.find((j) => j.id === args.jobId);
      if (!job) {
        throw new Error(`Job with ID ${args.jobId} not found`);
      }

      // Simple keyword extraction (in production, use NLP or Claude API)
      const techKeywords = [
        "React", "Node.js", "JavaScript", "TypeScript", "Python",
        "SQL", "MongoDB", "AWS", "Docker", "Git", "REST API",
        "GraphQL", "Express", "Next.js", "Vue", "Angular"
      ];

      const foundSkills = techKeywords.filter(skill => 
        job.description.toLowerCase().includes(skill.toLowerCase())
      );

      return {
        content: [
          {
            type: "text",
            text: `Key Requirements for: ${job.title} at ${job.company}\n\n` +
                  `Technical Skills Mentioned:\n${foundSkills.map(s => `- ${s}`).join("\n")}\n\n` +
                  `Experience Level: ${job.experienceLevel}\n\n` +
                  `Full Description:\n${job.description}\n\n` +
                  `Action: Review these requirements and tailor your resume in Careerflow to highlight matching skills.`,
          },
        ],
      };
    }

    case "prepare_careerflow_data": {
      const job = db.jobs.find((j) => j.id === args.jobId);
      if (!job) {
        throw new Error(`Job with ID ${args.jobId} not found`);
      }

      const careerflowData = {
        jobTitle: job.title,
        company: job.company,
        location: job.location,
        jobDescription: job.description,
        jobUrl: job.url,
        salaryRange: job.salary || "Not specified",
      };

      // Update status to indicate it's ready for tailoring
      job.status = "tailoring";
      job.nextAction = "Tailor resume and cover letter in Careerflow";
      await writeDB(db);

      return {
        content: [
          {
            type: "text",
            text: `📋 Careerflow Data Prepared!\n\n` +
                  `Copy this information into Careerflow AI:\n\n` +
                  `Job Title: ${careerflowData.jobTitle}\n` +
                  `Company: ${careerflowData.company}\n` +
                  `Location: ${careerflowData.location}\n` +
                  `Salary: ${careerflowData.salaryRange}\n` +
                  `Job URL: ${careerflowData.jobUrl}\n\n` +
                  `Job Description:\n${careerflowData.jobDescription}\n\n` +
                  `---\n` +
                  `Next Steps:\n` +
                  `1. Go to Careerflow AI\n` +
                  `2. Paste the job description\n` +
                  `3. Generate tailored resume and cover letter\n` +
                  `4. Review and make your final adjustments\n` +
                  `5. Use 'update_job_status' to mark as 'applied' when done\n\n` +
                  `Job status updated to: tailoring`,
          },
        ],
      };
    }

    case "get_weekly_report": {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const stats = {
        total: db.jobs.length,
        new: db.jobs.filter((j) => j.status === "new").length,
        reviewed: db.jobs.filter((j) => j.status === "reviewed").length,
        tailoring: db.jobs.filter((j) => j.status === "tailoring").length,
        applied: db.jobs.filter((j) => j.status === "applied").length,
        interviewing: db.jobs.filter((j) => j.status === "interviewing").length,
        offers: db.jobs.filter((j) => j.status === "offer").length,
        rejected: db.jobs.filter((j) => j.status === "rejected").length,
      };

      const recentApplications = db.jobs.filter((j) => 
        j.appliedDate && new Date(j.appliedDate) >= weekAgo
      );

      return {
        content: [
          {
            type: "text",
            text: `📊 Weekly Job Search Report\n\n` +
                  `Total Jobs Tracked: ${stats.total}\n\n` +
                  `Pipeline Status:\n` +
                  `- New: ${stats.new}\n` +
                  `- Reviewed: ${stats.reviewed}\n` +
                  `- Tailoring: ${stats.tailoring}\n` +
                  `- Applied: ${stats.applied}\n` +
                  `- Interviewing: ${stats.interviewing}\n` +
                  `- Offers: ${stats.offers}\n` +
                  `- Rejected: ${stats.rejected}\n\n` +
                  `This Week's Activity:\n` +
                  `- Applications Submitted: ${recentApplications.length}\n\n` +
                  `Recent Applications:\n` +
                  recentApplications.slice(0, 5).map((j) => 
                    `- ${j.title} at ${j.company} (${j.appliedDate?.split('T')[0]})`
                  ).join("\n") +
                  `\n\nKeep up the great work! 🚀`,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start server
async function main() {
  await initDB();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Job Search MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});