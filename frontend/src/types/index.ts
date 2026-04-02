export interface User {
  id: number;
  name: string;
  email: string;
  github_username?: string;
  avatar_url?: string;
  current_score: number;
  total_reviews: number;
  badge: 'newcomer' | 'consistent' | 'improving' | 'declining' | 'pattern_offender';
  role: 'developer' | 'lead' | 'admin';
  team_rank?: number;
  weekly_delta?: number;
  score_goal?: number;
  score_goal_deadline?: string;
  score_breakdown?: ReviewScores;
}

export interface ReviewScores {
  overall: number;
  correctness: number;
  readability: number;
  security: number;
  performance: number;
  maintainability: number;
}

export interface ReviewComment {
  id?: number;
  filename?: string;
  line_start?: number;
  line_end?: number;
  content: string;
  suggestion?: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  categories: string[];
}

export interface Review {
  review_id: number;
  scores: ReviewScores;
  summary: string;
  grade: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  strengths: string[];
  critical_issues: Array<{
    title: string;
    explanation: string;
    fix: string;
    impact: string;
  }>;
  improvements: Array<{
    title: string;
    explanation: string;
    before: string;
    after: string;
  }>;
  comments: ReviewComment[];
  metrics: {
    estimated_complexity: string;
    test_coverage_hint: string;
    code_smell_count: number;
    security_issue_count: number;
    lines_analyzed: number;
  };
}

export interface DeveloperTrend {
  week_start: string;
  avg_score: number;
  reviews_count: number;
  bug_count: number;
  score_delta: number;
  rank_in_team: number;
  rank_delta: number;
  top_issue_slug: string;
  rolling_4w_avg: number;
}

export interface TopIssue {
  slug: string;
  label: string;
  severity: string;
  count: number;
  issue_rank: number;
}

export interface DeveloperAnalytics {
  trend: DeveloperTrend[];
  sparkline: { score: number; recorded_at: string }[];
  top_issues: TopIssue[];
  recent_reviews: RecentReview[];
  score_breakdown: {
    correctness: number;
    security: number;
    readability: number;
    performance: number;
    maintainability: number;
  } | null;
}

export interface RecentReview {
  id: number;
  score_overall: number;
  summary: string;
  created_at: string;
  pr_title?: string;
  pr_number?: number;
  repository?: string;
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  avatar_url?: string;
  badge: string;
  current_score: number;
  total_reviews: number;
  team_rank: number;
  weekly_delta: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}
