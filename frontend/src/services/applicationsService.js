import { supabase } from '../lib/supabaseClient.js';

// ============================================================================
// Owner: Member 3 - Ahmed Fayez (AI Integration & Applications Dashboard)
// File: services/applicationsService.js
// ----------------------------------------------------------------------------
// All reads and writes of the `applications` table.
//
// Columns: id, user_id, job_id, quiz_score (0-5), ai_match_score (0-100),
//          ai_strengths (jsonb array), ai_weaknesses (jsonb array),
//          status ('Submitted'), created_at
//
// RLS reminder: the client may only INSERT and SELECT its own rows. There is
// deliberately no UPDATE policy - a candidate must not be able to edit the
// scores that were submitted.
// ============================================================================

/**
 * Insert one finished application.
 *
 * @param {object} application
 * @param {string} application.jobId
 * @param {number} application.quizScore        0-5, calculated in JS by scoreQuiz()
 * @param {number} application.aiMatchScore     0-100, from the AI service
 * @param {string[]} application.aiStrengths
 * @param {string[]} application.aiWeaknesses
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function submitApplication(application) {
  // Read the authenticated identity from Supabase instead of accepting a user
  // id from the page. RLS also checks that the inserted user_id belongs to the
  // caller, so the database remains the final security boundary.
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return {
      data: null,
      error: userError || new Error('You must be signed in to submit an application.'),
    };
  }

  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: userData.user.id,
      job_id: application.jobId,
      quiz_score: application.quizScore,
      ai_match_score: application.aiMatchScore,
      ai_strengths: application.aiStrengths,
      ai_weaknesses: application.aiWeaknesses,
    })
    .select()
    .single();

  if (error) {
    // The database unique constraint (user_id, job_id) is the reliable
    // protection against duplicate submissions. The UI check is only a
    // convenience; this handles a direct submission or a race that the UI
    // could not prevent.
    if (error.code === '23505') {
      const duplicateError = new Error('You have already applied for this job.');
      duplicateError.code = 'ALREADY_APPLIED';
      return { data: null, error: duplicateError };
    }

    return { data: null, error };
  }

  return { data, error: null };
}

/**
 * The dashboard query: my applications + the job title and company name.
 * One request thanks to the foreign key relationship in Postgres:
 *   select('id, quiz_score, ai_match_score, ..., jobs(title, company_name)')
 *
 * @returns {Promise<{ data: object[]|null, error: Error|null }>}
 */
export async function getMyApplications() {
  // The identity is resolved here so this service never trusts a user id passed
  // by a page or component.
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return {
      data: null,
      error: userError || new Error('You must be signed in to view applications.'),
    };
  }

  // This embedded relation uses the jobs foreign key to fetch the title and
  // company in the same request. Descending creation time puts submissions
  // newest first.
  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, user_id, job_id, quiz_score, ai_match_score, ai_strengths, ai_weaknesses, status, created_at, jobs(title, company_name)',
    )
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false });

  return { data: data || null, error };
}

/**
 * Has the current user already applied for this job?
 * Used by JobDetails.jsx to disable the Apply button (Member 2 calls it).
 *
 * @param {string} jobId
 * @returns {Promise<boolean>}
 */
export async function hasApplied(jobId) {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  // The JobDetails page is allowed to treat lookup errors as "not applied"
  // until it can safely show an application error, as specified by the
  // cross-member integration note in PLAN.md.
  if (userError || !userData?.user) {
    return false;
  }

  const { data, error } = await supabase
    .from('applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  // A Supabase RLS or network error must not make this look like a successful
  // application. Returning false keeps the UI from falsely disabling Apply.
  if (error) {
    return false;
  }

  return data !== null;
}
