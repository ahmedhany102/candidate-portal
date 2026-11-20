import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Loader from '../components/Loader.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { getMyApplications } from '../services/applicationsService.js';
import './MyApplications.css';

// ============================================================================
// Owner: Member 3 - Ahmed Fayez (AI Integration & Applications Dashboard)
// File: pages/MyApplications.jsx
// Route: /applications   (protected)
// ----------------------------------------------------------------------------
// The page loads one joined applications query and renders only client-safe
// values. Missing job relations and JSONB arrays are normalized for the UI.
// ============================================================================

// The AI match bar is visual-only: the score itself is stored and returned
// separately, while this helper chooses its green, amber, or red variant.
function scoreVariant(percent) {
  if (percent >= 70) {
    return 'success';
  }
  if (percent >= 40) {
    return 'warning';
  }
  return 'danger';
}

export default function MyApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadApplications() {
      setLoading(true);
      setError('');

      try {
        const result = await getMyApplications();
        if (!active) {
          return;
        }

        if (result.error) {
          setError(result.error.message || 'Could not load your applications.');
          setApplications([]);
        } else {
          setApplications(Array.isArray(result.data) ? result.data : []);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError?.message ||
              'Could not load your applications. Please try again.',
          );
          setApplications([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadApplications();

    return () => {
      active = false;
    };
  }, [retryCount]);

  function formatDate(dateText) {
    if (!dateText) {
      return 'Submission date unavailable';
    }

    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) {
      return 'Submission date unavailable';
    }

    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function toSafeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  return (
    <section className="applications-page">
      <header className="page-header">
        <h1>My Applications</h1>
        <p>Every submission with its quiz score and the AI CV match analysis.</p>
      </header>

      {loading ? (
        <div className="card">
          <Loader message="Loading your applications..." />
        </div>
      ) : error ? (
        <div className="card applications-error" role="alert">
          <h2>Could not load applications</h2>
          <p>{error}</p>
          <button
            className="btn"
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
          >
            Try again
          </button>
        </div>
      ) : applications.length === 0 ? (
        <div className="card applications-empty">
          <h2>No applications yet</h2>
          <p>You have not applied for any job yet</p>
          <Link className="btn" to="/">
            Browse jobs
          </Link>
        </div>
      ) : (
        <>
          <p className="applications-count">
            {applications.length}{' '}
            {applications.length === 1 ? 'application' : 'applications'}
          </p>

          <div className="applications-list">
            {applications.map((application) => {
              const strengths = toSafeArray(application.ai_strengths);
              const weaknesses = toSafeArray(application.ai_weaknesses);
              const aiMatchScore = Number(application.ai_match_score) || 0;
              const quizScore = Number(application.quiz_score) || 0;
              const job = application.jobs || null;

              return (
                <article className="card application-card" key={application.id}>
                  <header className="application-card-header">
                    <div>
                      <h2 className="application-card-title">
                        {job?.title || 'Job unavailable'}
                      </h2>
                      <p className="application-card-company">
                        {job?.company_name || 'Company unavailable'}
                      </p>
                    </div>

                    <div className="application-card-meta">
                      <span className="status-badge">
                        {application.status || 'Submitted'}
                      </span>
                      <time className="application-card-date">
                        {formatDate(application.created_at)}
                      </time>
                    </div>
                  </header>

                  <div className="application-scores">
                    <ProgressBar
                      label="Quiz Score"
                      value={quizScore}
                      max={5}
                      suffix="/ 5"
                      variant="primary"
                    />
                    <ProgressBar
                      label="AI Match"
                      value={aiMatchScore}
                      max={100}
                      suffix="/ 100"
                      variant={scoreVariant(aiMatchScore)}
                    />
                  </div>

                  <div className="application-feedback">
                    <section>
                      <h3>Strengths</h3>
                      {strengths.length > 0 ? (
                        <ul className="feedback-list feedback-list--strengths">
                          {strengths.map((strength, index) => (
                            <li key={`${application.id}-strength-${index}`}>
                              {strength}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="feedback-empty">No strengths recorded</p>
                      )}
                    </section>

                    <section>
                      <h3>Weaknesses</h3>
                      {weaknesses.length > 0 ? (
                        <ul className="feedback-list feedback-list--weaknesses">
                          {weaknesses.map((weakness, index) => (
                            <li key={`${application.id}-weakness-${index}`}>
                              {weakness}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="feedback-empty">No weaknesses recorded</p>
                      )}
                    </section>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
