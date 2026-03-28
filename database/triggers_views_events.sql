USE codex_db;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_after_review_insert$$
CREATE TRIGGER trg_after_review_insert
AFTER INSERT ON reviews
FOR EACH ROW
BEGIN
    IF NEW.is_playground = FALSE THEN

        UPDATE users
        SET
            current_score = (
                SELECT ROUND(AVG(score_overall), 2)
                FROM reviews
                WHERE developer_id = NEW.developer_id
                  AND is_playground = FALSE
            ),
            total_reviews = total_reviews + 1
        WHERE id = NEW.developer_id;

        IF NEW.repository_id IS NOT NULL THEN
            UPDATE repositories
            SET
                avg_score = (
                    SELECT ROUND(AVG(score_overall), 2)
                    FROM reviews
                    WHERE repository_id = NEW.repository_id
                      AND is_playground = FALSE
                ),
                total_prs_reviewed = total_prs_reviewed + 1
            WHERE id = NEW.repository_id;
        END IF;

        INSERT INTO score_history (developer_id, review_id, score)
        VALUES (NEW.developer_id, NEW.id, NEW.score_overall);

    END IF;
END$$

DROP TRIGGER IF EXISTS trg_after_pr_state_update$$
CREATE TRIGGER trg_after_pr_state_update
AFTER UPDATE ON pull_requests
FOR EACH ROW
BEGIN
    DECLARE v_score    DECIMAL(4,2);
    DECLARE v_team_id  INT UNSIGNED;

    IF OLD.state != 'merged' AND NEW.state = 'merged' THEN

        SELECT score_overall INTO v_score
        FROM reviews
        WHERE pull_request_id = NEW.id
        LIMIT 1;

        SELECT team_id INTO v_team_id
        FROM repositories
        WHERE id = NEW.repository_id
        LIMIT 1;

        IF v_score IS NOT NULL AND v_score < 5.0 THEN
            INSERT INTO alert_logs (developer_id, team_id, alert_type, message, context_json)
            VALUES (
                NEW.developer_id,
                v_team_id,
                'low_score_merge',
                CONCAT('PR #', NEW.pr_number, ' was merged with a review score of ', v_score, '/10.'),
                JSON_OBJECT(
                    'pr_id',     NEW.id,
                    'pr_number', NEW.pr_number,
                    'score',     v_score,
                    'repo_id',   NEW.repository_id
                )
            );
        END IF;

        UPDATE users u
        JOIN (
            SELECT
                developer_id,
                AVG(score_overall) AS recent_avg,
                (SELECT AVG(score_overall)
                 FROM reviews r2
                 WHERE r2.developer_id = u2.developer_id
                   AND r2.is_playground = FALSE
                   AND r2.created_at BETWEEN DATE_SUB(NOW(), INTERVAL 8 WEEK)
                                         AND DATE_SUB(NOW(), INTERVAL 4 WEEK)
                ) AS older_avg
            FROM reviews u2
            WHERE developer_id  = NEW.developer_id
              AND is_playground  = FALSE
              AND created_at    >= DATE_SUB(NOW(), INTERVAL 4 WEEK)
            GROUP BY developer_id
        ) trend ON trend.developer_id = u.id
        SET u.badge = CASE
            WHEN trend.recent_avg >= 7.5 THEN 'consistent'
            WHEN trend.recent_avg > COALESCE(trend.older_avg, trend.recent_avg) THEN 'improving'
            WHEN trend.recent_avg < COALESCE(trend.older_avg, trend.recent_avg) - 1.0 THEN 'declining'
            ELSE 'consistent'
        END
        WHERE u.id = NEW.developer_id
          AND u.badge != 'pattern_offender';

    END IF;
END$$

DROP TRIGGER IF EXISTS trg_after_comment_category_insert$$
CREATE TRIGGER trg_after_comment_category_insert
AFTER INSERT ON comment_categories
FOR EACH ROW
BEGIN
    DECLARE v_dev_id   INT UNSIGNED;
    DECLARE v_tax_slug VARCHAR(50);
    DECLARE v_count    INT;

    SELECT r.developer_id INTO v_dev_id
    FROM review_comments rc
    JOIN reviews r ON r.id = rc.review_id
    WHERE rc.id = NEW.comment_id
    LIMIT 1;

    SELECT slug INTO v_tax_slug
    FROM issue_taxonomy
    WHERE id = NEW.taxonomy_id;

    SELECT COUNT(*) INTO v_count
    FROM comment_categories cc
    JOIN review_comments rc ON rc.id  = cc.comment_id
    JOIN reviews r          ON r.id   = rc.review_id
    WHERE r.developer_id  = v_dev_id
      AND cc.taxonomy_id  = NEW.taxonomy_id
      AND r.created_at   >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND r.is_playground = FALSE;

    IF v_count >= 3 THEN
        CALL flag_repeat_offender(v_dev_id);
    END IF;
END$$

DELIMITER ;

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_developer_leaderboard AS
WITH ranked_devs AS (
    SELECT
        u.id,
        u.name,
        u.avatar_url,
        u.badge,
        u.current_score,
        u.total_reviews,
        tm.team_id,
        RANK() OVER (
            PARTITION BY tm.team_id
            ORDER BY u.current_score DESC
        ) AS team_rank,
        LAG(u.current_score) OVER (
            PARTITION BY tm.team_id
            ORDER BY u.current_score DESC
        ) AS prev_score_in_rank
    FROM users u
    JOIN team_members tm ON tm.user_id = u.id
    WHERE u.total_reviews > 0
)
SELECT
    rd.*,
    ROUND(rd.current_score - COALESCE(
        (SELECT avg_score FROM developer_snapshots ds
         WHERE ds.developer_id = rd.id
           AND ds.week_start = DATE_SUB(
               DATE_SUB(CURDATE(), INTERVAL (DAYOFWEEK(CURDATE()) + 5) % 7 DAY),
               INTERVAL 7 DAY
           )
         LIMIT 1
        ), rd.current_score
    ), 2) AS weekly_delta
FROM ranked_devs rd;

CREATE OR REPLACE VIEW v_repo_health_summary AS
SELECT
    repo.id,
    repo.full_name,
    repo.language,
    repo.avg_score,
    repo.total_prs_reviewed,
    repo.team_id,
    COUNT(DISTINCT pr.developer_id)                            AS unique_contributors,
    COUNT(DISTINCT CASE WHEN pr.state = 'open' THEN pr.id END) AS open_prs,
    ROUND(
        SUM(CASE WHEN rc.severity IN ('high','critical') THEN 1 ELSE 0 END)
        / NULLIF(COUNT(DISTINCT r.id), 0)
    , 2)                                                        AS high_issues_per_review,
    MAX(r.created_at)                                           AS last_reviewed_at
FROM repositories repo
LEFT JOIN pull_requests pr   ON pr.repository_id = repo.id
LEFT JOIN reviews r          ON r.repository_id  = repo.id AND r.is_playground = FALSE
LEFT JOIN review_comments rc ON rc.review_id     = r.id
GROUP BY repo.id, repo.full_name, repo.language, repo.avg_score,
         repo.total_prs_reviewed, repo.team_id;

CREATE OR REPLACE VIEW v_developer_trend AS
SELECT
    ds.developer_id,
    ds.team_id,
    ds.week_start,
    ds.avg_score,
    ds.reviews_count,
    ds.bug_count,
    ds.score_delta,
    ds.rank_in_team,
    ds.rank_delta,
    ds.top_issue_slug,
    AVG(ds.avg_score) OVER (
        PARTITION BY ds.developer_id
        ORDER BY ds.week_start
        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
    ) AS rolling_4w_avg
FROM developer_snapshots ds
WHERE ds.week_start >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK);

CREATE OR REPLACE VIEW v_team_weekly_report AS
WITH last_week AS (
    SELECT DATE_SUB(
        DATE_SUB(CURDATE(), INTERVAL (DAYOFWEEK(CURDATE()) + 5) % 7 DAY),
        INTERVAL 7 DAY
    ) AS week_start
)
SELECT
    t.id                                                        AS team_id,
    t.name                                                      AS team_name,
    lw.week_start,
    COUNT(DISTINCT ds.developer_id)                             AS active_devs,
    ROUND(AVG(ds.avg_score), 2)                                 AS team_avg_score,
    ROUND(AVG(ds.score_delta), 2)                               AS avg_score_delta,
    SUM(ds.reviews_count)                                       AS total_reviews,
    SUM(ds.bug_count)                                           AS total_bugs,
    SUM(ds.security_count)                                      AS total_security_issues,
    SUM(CASE WHEN ds.is_pattern_offender THEN 1 ELSE 0 END)     AS pattern_offenders,
    (SELECT u.name
     FROM developer_snapshots ds2
     JOIN users u ON u.id = ds2.developer_id
     WHERE ds2.team_id    = t.id
       AND ds2.week_start = lw.week_start
     ORDER BY ds2.avg_score DESC LIMIT 1)                       AS top_performer,
    (SELECT u.name
     FROM developer_snapshots ds3
     JOIN users u ON u.id = ds3.developer_id
     WHERE ds3.team_id    = t.id
       AND ds3.week_start = lw.week_start
     ORDER BY ds3.score_delta DESC LIMIT 1)                     AS most_improved
FROM teams t
CROSS JOIN last_week lw
LEFT JOIN developer_snapshots ds
    ON ds.team_id    = t.id
   AND ds.week_start = lw.week_start
GROUP BY t.id, t.name, lw.week_start;

-- ============================================================
-- EVENTS
-- ============================================================

DELIMITER $$

DROP EVENT IF EXISTS evt_weekly_snapshot$$
CREATE EVENT evt_weekly_snapshot
ON SCHEDULE EVERY 1 WEEK
STARTS TIMESTAMP(
    DATE_ADD(
        DATE_SUB(CURDATE(), INTERVAL DAYOFWEEK(CURDATE()) - 1 DAY),
        INTERVAL 6 DAY
    ),
    '23:59:00'
)
DO BEGIN
    CALL generate_weekly_snapshot();
END$$

DROP EVENT IF EXISTS evt_hourly_alert_check$$
CREATE EVENT evt_hourly_alert_check
ON SCHEDULE EVERY 1 HOUR
DO BEGIN
    INSERT INTO alert_logs (developer_id, team_id, alert_type, message, context_json)
    SELECT
        u.id,
        tm.team_id,
        'score_drop',
        CONCAT(u.name, '''s score dropped by ', ABS(ROUND(sh_recent.score - sh_old.score, 2)), ' points.'),
        JSON_OBJECT(
            'from_score', sh_old.score,
            'to_score',   sh_recent.score,
            'delta',      ROUND(sh_recent.score - sh_old.score, 2)
        )
    FROM users u
    JOIN team_members tm ON tm.user_id = u.id
    JOIN score_history sh_recent
        ON sh_recent.developer_id = u.id
       AND sh_recent.recorded_at  = (
               SELECT MAX(recorded_at)
               FROM score_history
               WHERE developer_id = u.id
           )
    JOIN score_history sh_old
        ON sh_old.developer_id = u.id
       AND sh_old.recorded_at  = (
               SELECT MAX(recorded_at)
               FROM score_history
               WHERE developer_id = u.id
                 AND recorded_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
           )
    WHERE (sh_recent.score - sh_old.score) < -2.0
      AND NOT EXISTS (
          SELECT 1 FROM alert_logs al
          WHERE al.developer_id = u.id
            AND al.alert_type   = 'score_drop'
            AND al.created_at  >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      );
END$$

DROP EVENT IF EXISTS evt_daily_playground_cleanup$$
CREATE EVENT evt_daily_playground_cleanup
ON SCHEDULE EVERY 1 DAY
STARTS TIMESTAMP(CURDATE(), '03:00:00')
DO BEGIN
    DELETE FROM reviews
    WHERE is_playground = TRUE
      AND expires_at IS NOT NULL
      AND expires_at < NOW();
END$$

DELIMITER ;
