import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { analyzeCv, AI_ERROR_MESSAGES } from '../services/aiService.js';
import { submitApplication } from '../services/applicationsService.js';
import { getJobById } from '../services/jobsService.js';
import { downloadCv, getProfile } from '../services/profileService.js';
import { logSecurityEvent } from '../services/securityLogService.js';
import './Applying.css';

// ============================================================================
// Owner: Member 3 - Ahmed Fayez (AI Integration & Applications Dashboard)
// File: pages/Applying.jsx
// Route: /jobs/:jobId/apply   (protected)
// ----------------------------------------------------------------------------
// This is the bridge between the quiz (Member 2) and the database + AI service.
//
// Pipeline order:
//   1. read and validate the quiz score from router state
//   2. load the job
//   3. load the profile and download the CV
//   4. analyze the CV, then insert the complete application once
//   5. log the submission and open the applications dashboard
// ============================================================================
export default function Applying() {
  const { jobId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const quizScore = location.state?.quizScore;
  const pipelineStarted = useRef(false);
  const [phase, setPhase] = useState('uploading');
  const [errorMessage, setErrorMessage] = useState('');
  const [done, setDone] = useState(false);

  const hasValidQuizState =
    Number.isInteger(quizScore) && quizScore >= 0 && quizScore <= 5;

  async function runPipeline() {
    setDone(false);
    setErrorMessage('');
    setPhase('uploading');

    try {
      const jobResult = await getJobById(jobId);
      if (jobResult.error) {
        throw new Error(jobResult.error.message || 'Could not load this job.');
      }
      if (!jobResult.data) {
        throw new Error('This job could not be found.');
      }

      // The CV is downloaded before analysis because the AI service requires
      // a File or Blob. The profile stores only a private Storage path.
      const profileResult = await getProfile();
      if (profileResult.error) {
        throw new Error(profileResult.error.message || 'Could not load your profile.');
      }
      if (!profileResult.data?.cv_url) {
        throw new Error(
          'Upload a CV in your profile before applying for this job.',
        );
      }

      const cvResult = await downloadCv(profileResult.data.cv_url);
      if (cvResult.error || !cvResult.data) {
        throw new Error(
          cvResult.error?.message ||
            'Could not download your CV. Please try uploading it again.',
        );
      }

      setPhase('analyzing');
      const analysis = await analyzeCv(cvResult.data, jobResult.data);

      // Saving is the only phase that writes to the applications table. This
      // ensures no row is inserted until both the quiz and AI analysis exist.
      setPhase('saving');
      const submission = await submitApplication({
        jobId,
        quizScore,
        aiMatchScore: analysis.match_score,
        aiStrengths: analysis.strengths,
        aiWeaknesses: analysis.weaknesses,
      });

      if (submission.error) {
        if (submission.error.code === 'ALREADY_APPLIED') {
          throw new Error(
            AI_ERROR_MESSAGES.ALREADY_APPLIED ||
              'You have already applied for this job.',
          );
        }
        throw submission.error;
      }

      // This security event is an append-only audit record. A logging failure
      // must not turn a completed database submission into a duplicate attempt.
      try {
        await logSecurityEvent({
          eventType: 'APPLICATION_SUBMITTED',
          details: `Submitted application for job ${jobId}`,
        });
      } catch {
        // The application is already saved; never retry submission just because
        // an unrelated audit-log call fails.
      }

      setPhase('done');
      setDone(true);
      window.setTimeout(() => navigate('/applications', { replace: true }), 700);
    } catch (error) {
      const message =
        error?.code && AI_ERROR_MESSAGES[error.code]
          ? AI_ERROR_MESSAGES[error.code]
          : error?.message ||
            'The application could not be submitted. Please try again.';
      setErrorMessage(message);
      setPhase('error');
    }
  }

  useEffect(() => {
    if (!hasValidQuizState) {
      return undefined;
    }

    // React StrictMode runs effects twice in development. This guard prevents
    // a second submit from racing the first and helps protect against duplicate
    // application inserts.
    if (!pipelineStarted.current) {
      pipelineStarted.current = true;
      runPipeline();
    }

    return undefined;
  }, [jobId, hasValidQuizState]);

  function retryPipeline() {
    pipelineStarted.current = true;
    runPipeline();
  }

  if (!hasValidQuizState) {
    return <Navigate to={`/jobs/${jobId}/quiz`} replace />;
  }

  return (
    <section className="applying-page">
      <header className="page-header">
        <h1>Submitting your application</h1>
        <p>Quiz score: <strong>{quizScore} / 5</strong></p>
      </header>

      <div className="card">
        {phase !== 'error' ? (
          <>
            <ol className="applying-steps" aria-label="Application progress">
              <li
                className={`applying-step ${
                  done || phase === 'analyzing' || phase === 'saving'
                    ? 'applying-step--done'
                    : 'applying-step--active'
                }`}
              >
                <span className="applying-step-icon" aria-hidden="true">
                  {done || phase === 'analyzing' || phase === 'saving' ? '✓' : '1'}
                </span>
                <span>
                  <strong>Downloading and uploading CV</strong>
                  {phase === 'uploading' && <small>Preparing the document</small>}
                </span>
              </li>
              <li
                className={`applying-step ${
                  done || phase === 'saving'
                    ? 'applying-step--done'
                    : phase === 'analyzing'
                      ? 'applying-step--active'
                      : ''
                }`}
              >
                <span className="applying-step-icon" aria-hidden="true">
                  {done || phase === 'saving' ? '✓' : '2'}
                </span>
                <span>
                  <strong>Analyzing CV</strong>
                  {phase === 'analyzing' && <small>Comparing skills and job details</small>}
                </span>
              </li>
              <li
                className={`applying-step ${
                  done
                    ? 'applying-step--done'
                    : phase === 'saving'
                      ? 'applying-step--active'
                      : ''
                }`}
              >
                <span className="applying-step-icon" aria-hidden="true">
                  {done ? '✓' : '3'}
                </span>
                <span>
                  <strong>Saving application</strong>
                  {phase === 'saving' && <small>Writing the final record</small>}
                  {done && <small>Application submitted successfully</small>}
                </span>
              </li>
            </ol>

            {done && (
              <div className="applying-success" role="status" aria-live="polite">
                Your application was submitted. Opening My Applications...
              </div>
            )}
          </>
        ) : (
          <div className="applying-error" role="alert">
            <h2>Submission failed</h2>
            <p>{errorMessage}</p>
            {errorMessage.includes('CV') && (
              <p>
                <Link to="/profile">Upload or update your CV</Link>, then try again.
              </p>
            )}
            {errorMessage.includes('AI service') && (
              <p>
                Make sure the AI service is running on <code>localhost:8000</code>.
              </p>
            )}
            <div className="applying-actions">
              <button className="btn" type="button" onClick={retryPipeline}>
                Try again
              </button>
              <Link className="btn btn-secondary" to={`/jobs/${jobId}`}>
                Back to job
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
