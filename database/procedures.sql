USE codex_db;

DELIMITER $$

DROP PROCEDURE IF EXISTS calculate_developer_score$$
CREATE PROCEDURE calculate_developer_score(
    IN  p_developer_id  INT UNSIGNED,
    IN  p_week_date     DATE,
    OUT p_score         DECIMAL(4,2),
    OUT p_review_count  INT
)
BEGIN
    DECLARE v_week_start DATE;
    DECLARE v_week_end   DATE;

    SET v_week_start = DATE_SUB(p_week_date, INTERVAL (DAYOFWEEK(p_week_date) + 5) % 7 DAY);
    SET v_week_end   = DATE_ADD(v_week_start, INTERVAL 6 DAY);

    SELECT
        COUNT(*),
        ROUND(
            AVG(
                (score_correctness     * 0.30) +
                (score_security        * 0.25) +
                (score_readability     * 0.20) +
                (score_performance     * 0.15) +
                (score_maintainability * 0.10)
            ), 2
        )
    INTO p_review_count, p_score
    FROM reviews
    WHERE developer_id = p_developer_id
      AND is_playground = FALSE
      AND created_at BETWEEN v_week_start AND v_week_end;

    IF p_score IS NULL THEN
        SET p_score = 0.00;
    END IF;
END$$

DROP PROCEDURE IF EXISTS generate_weekly_snapshot$$
CREATE PROCEDURE generate_weekly_snapshot()
BEGIN
    DECLARE done          INT DEFAULT FALSE;
    DECLARE v_dev_id      INT UNSIGNED;
    DECLARE v_team_id     INT UNSIGNED;
    DECLARE v_week_start  DATE;
    DECLARE v_score       DECIMAL(4,2);
    DECLARE v_count       INT;
    DECLARE v_prev_score  DECIMAL(4,2);
    DECLARE v_bug_count   INT;
    DECLARE v_sec_count   INT;
    DECLARE v_top_issue   VARCHAR(50);

    DECLARE dev_cursor CURSOR FOR
        SELECT DISTINCT u.id, tm.team_id
        FROM users u
        JOIN team_members tm ON tm.user_id = u.id;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    SET v_week_start = DATE_SUB(CURDATE(), INTERVAL (DAYOFWEEK(CURDATE()) + 5) % 7 + 7 DAY);

    OPEN dev_cursor;

    snapshot_loop: LOOP
        FETCH dev_cursor INTO v_dev_id, v_team_id;
        IF done THEN LEAVE snapshot_loop; END IF;

        CALL calculate_developer_score(v_dev_id, v_week_start, v_score, v_count);

        IF v_count = 0 THEN ITERATE snapshot_loop; END IF;

        SELECT COALESCE(avg_score, 0) INTO v_prev_score
        FROM developer_snapshots
        WHERE developer_id = v_dev_id
          AND week_start   = DATE_SUB(v_week_start, INTERVAL 7 DAY)
        LIMIT 1;

        SELECT COUNT(*) INTO v_bug_count
        FROM reviews r
        JOIN review_comments rc    ON rc.review_id  = r.id
        JOIN comment_categories cc ON cc.comment_id = rc.id
        JOIN issue_taxonomy it     ON it.id          = cc.taxonomy_id
        WHERE r.developer_id  = v_dev_id
          AND it.slug          = 'bug'
          AND r.created_at    >= v_week_start
          AND r.is_playground  = FALSE;

        SELECT COUNT(*) INTO v_sec_count
        FROM reviews r
        JOIN review_comments rc    ON rc.review_id  = r.id
        JOIN comment_categories cc ON cc.comment_id = rc.id
        JOIN issue_taxonomy it     ON it.id          = cc.taxonomy_id
        WHERE r.developer_id  = v_dev_id
          AND it.slug          = 'security'
          AND r.created_at    >= v_week_start
          AND r.is_playground  = FALSE;

        SELECT it.slug INTO v_top_issue
        FROM reviews r
        JOIN review_comments rc    ON rc.review_id  = r.id
        JOIN comment_categories cc ON cc.comment_id = rc.id
        JOIN issue_taxonomy it     ON it.id          = cc.taxonomy_id
        WHERE r.developer_id  = v_dev_id
          AND r.created_at   >= v_week_start
          AND r.is_playground = FALSE
        GROUP BY it.slug
        ORDER BY COUNT(*) DESC
        LIMIT 1;

        INSERT INTO developer_snapshots
            (developer_id, team_id, week_start, reviews_count, avg_score,
             bug_count, security_count, top_issue_slug, score_delta)
        VALUES
            (v_dev_id, v_team_id, v_week_start, v_count, v_score,
             v_bug_count, v_sec_count, v_top_issue, ROUND(v_score - v_prev_score, 2))
        ON DUPLICATE KEY UPDATE
            reviews_count  = v_count,
            avg_score      = v_score,
            bug_count      = v_bug_count,
            security_count = v_sec_count,
            top_issue_slug = v_top_issue,
            score_delta    = ROUND(v_score - v_prev_score, 2);

    END LOOP;

    CLOSE dev_cursor;

    UPDATE developer_snapshots ds1
    JOIN (
        SELECT
            id,
            RANK() OVER (PARTITION BY team_id ORDER BY avg_score DESC) AS new_rank
        FROM developer_snapshots
        WHERE week_start = v_week_start
    ) ranked ON ranked.id = ds1.id
    SET ds1.rank_in_team = ranked.new_rank
    WHERE ds1.week_start = v_week_start;

    UPDATE developer_snapshots ds_curr
    JOIN developer_snapshots ds_prev
        ON  ds_prev.developer_id = ds_curr.developer_id
        AND ds_prev.week_start   = DATE_SUB(v_week_start, INTERVAL 7 DAY)
    SET ds_curr.rank_delta = ds_prev.rank_in_team - ds_curr.rank_in_team
    WHERE ds_curr.week_start = v_week_start;

END$$

DROP PROCEDURE IF EXISTS flag_repeat_offender$$
CREATE PROCEDURE flag_repeat_offender(IN p_developer_id INT UNSIGNED)
BEGIN
    DECLARE v_max_count INT DEFAULT 0;
    DECLARE v_top_slug  VARCHAR(50);

    SELECT it.slug, COUNT(*) AS cnt
    INTO v_top_slug, v_max_count
    FROM reviews r
    JOIN review_comments rc    ON rc.review_id   = r.id
    JOIN comment_categories cc ON cc.comment_id  = rc.id
    JOIN issue_taxonomy it     ON it.id           = cc.taxonomy_id
    WHERE r.developer_id  = p_developer_id
      AND r.created_at   >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND r.is_playground = FALSE
    GROUP BY it.slug
    ORDER BY cnt DESC
    LIMIT 1;

    IF v_max_count >= 3 THEN
        UPDATE users
        SET badge = 'pattern_offender'
        WHERE id = p_developer_id;

        INSERT INTO alert_logs (developer_id, team_id, alert_type, message, context_json)
        SELECT
            p_developer_id,
            tm.team_id,
            'pattern_offender',
            CONCAT('Developer has repeated "', v_top_slug, '" issues ', v_max_count, ' times in 30 days.'),
            JSON_OBJECT('issue_slug', v_top_slug, 'count', v_max_count)
        FROM team_members tm
        WHERE tm.user_id = p_developer_id
        LIMIT 1;
    END IF;
END$$

DROP PROCEDURE IF EXISTS get_team_analytics$$
CREATE PROCEDURE get_team_analytics(
    IN p_team_id  INT UNSIGNED,
    IN p_start    DATE,
    IN p_end      DATE
)
BEGIN
    WITH base_reviews AS (
        SELECT
            r.id            AS review_id,
            r.developer_id,
            r.score_overall,
            r.score_security,
            r.created_at
        FROM reviews r
        JOIN team_members tm ON tm.user_id = r.developer_id AND tm.team_id = p_team_id
        WHERE r.is_playground = FALSE
          AND DATE(r.created_at) BETWEEN p_start AND p_end
    ),
    dev_aggregates AS (
        SELECT
            developer_id,
            COUNT(*)                      AS review_count,
            ROUND(AVG(score_overall), 2)  AS avg_score,
            ROUND(MIN(score_overall), 2)  AS min_score,
            ROUND(MAX(score_overall), 2)  AS max_score,
            ROUND(AVG(score_security), 2) AS avg_security,
            ROUND(
                AVG(score_overall) OVER (
                    PARTITION BY developer_id
                    ORDER BY DATE(created_at)
                    ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
                ), 2
            ) AS rolling_4w_avg
        FROM base_reviews
        GROUP BY developer_id
    ),
    ranked AS (
        SELECT
            *,
            RANK() OVER (ORDER BY avg_score DESC)         AS team_rank,
            LAG(avg_score) OVER (ORDER BY avg_score DESC) AS prev_avg
        FROM dev_aggregates
    )
    SELECT
        u.id,
        u.name,
        u.avatar_url,
        u.badge,
        r.review_count,
        r.avg_score,
        r.min_score,
        r.max_score,
        r.avg_security,
        r.rolling_4w_avg,
        r.team_rank,
        ROUND(r.avg_score - COALESCE(r.prev_avg, r.avg_score), 2) AS score_delta
    FROM ranked r
    JOIN users u ON u.id = r.developer_id
    ORDER BY r.team_rank;
END$$

DROP PROCEDURE IF EXISTS search_reviews$$
CREATE PROCEDURE search_reviews(
    IN p_team_id INT UNSIGNED,
    IN p_query   VARCHAR(500)
)
BEGIN
    SELECT
        rc.id           AS comment_id,
        rc.content,
        rc.suggestion,
        rc.severity,
        rc.filename,
        rc.line_start,
        r.id            AS review_id,
        r.score_overall,
        r.created_at,
        u.name          AS developer_name,
        u.avatar_url,
        repo.full_name  AS repository,
        MATCH(rc.content) AGAINST (p_query IN BOOLEAN MODE) AS relevance_score
    FROM review_comments rc
    JOIN reviews r          ON r.id       = rc.review_id
    JOIN users u            ON u.id       = r.developer_id
    JOIN team_members tm    ON tm.user_id = u.id AND tm.team_id = p_team_id
    LEFT JOIN repositories repo ON repo.id = r.repository_id
    WHERE MATCH(rc.content) AGAINST (p_query IN BOOLEAN MODE)
      AND r.is_playground = FALSE
    ORDER BY relevance_score DESC
    LIMIT 50;
END$$

DELIMITER ;
