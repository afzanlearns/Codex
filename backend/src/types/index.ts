export interface User {
  id: number;
  name: string;
  email: string;
  github_id?: number;
  github_username?: string;
  avatar_url?: string;
  current_score: number;
  total_reviews: number;
  badge: 'newcomer' | 'consistent' | 'improving' | 'declining' | 'pattern_offender';
  role: 'developer' | 'lead' | 'admin';
  created_at: Date;
}

export interface Review {
  id: number;
  pull_request_id?: number;
  developer_id: number;
  repository_id?: number;
  is_playground: boolean;
  language?: string;
  score_overall: number;
  score_correctness: number;
  score_readability: number;
  score_security: number;
  score_performance: number;
  score_maintainability: number;
  summary: string;
  model_used?: string;
  tokens_used?: number;
  created_at: Date;
}

export interface ReviewComment {
  id: number;
  review_id: number;
  filename?: string;
  line_start?: number;
  line_end?: number;
  content: string;
  suggestion?: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  categories?: string[];
}

export interface AIReviewResult {
  scores: {
    overall: number;
    correctness: number;
    readability: number;
    security: number;
    performance: number;
    maintainability: number;
  };
  summary: string;
  comments: Array<{
    filename?: string;
    line_start?: number;
    line_end?: number;
    content: string;
    suggestion?: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    categories: string[];
  }>;
}

export interface AuthRequest extends Express.Request {
  user?: { id: number; email: string; role: string };
}

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; email: string; role: string };
    }
  }
}
