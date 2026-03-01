// --- 1. CONFIGURATION ---
const supabaseUrl = 'https://kkaelwhdcsgaodbhrxqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrYWVsd2hkY3NnYW9kYmhyeHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTA4NzksImV4cCI6MjA3MTc2Njg3OX0.wSFv1AZgZDXjGHiIwOHyWzqTDk0v6NbR4-2r90iF9ok';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentStep = 1;
let applicationData = JSON.parse(localStorage.getItem('applicationData')) || {};

/**
 * 2. AJAX Loader Function
 */
async function loadStep(step) {
    const contentDiv = document.getElementById('ajax-content');
    if (!contentDiv) return;

    // Start Fade Out Animation
    contentDiv.style.opacity = '0'; 
    contentDiv.style.transition = 'opacity 0.3s ease';

    // Small delay to allow the fade-out to happen
    setTimeout(async () => {
        try {
            console.log(`Fetching: steps/step${step}.html`);
            const response = await fetch(`steps/step${step}.html`);
            
            if (!response.ok) {
                throw new Error(`Could not find steps/step${step}.html - Check your folder and file name!`);
            }
            
            const html = await response.text();
            
            // 1. Inject the HTML
            contentDiv.innerHTML = html;
            console.log("HTML Injected successfully");

            // 2. Update the logic
            currentStep = step;
            updateUI(step);
            restoreData(); 
            
            // 3. Initialize plugins (wrapped in try/catch so it doesn't break the whole page)
            try {
                initializePlugins(step);
            } catch (pluginError) {
                console.warn("Plugin init error (e.g. Flatpickr):", pluginError);
            }

            if (step === 4) initStep4();

        } catch (error) {
            console.error("AJAX Error:", error);
            contentDiv.innerHTML = `
                <div style="padding:40px; text-align:center; color:#D2042D;">
                    <i class="fas fa-exclamation-circle" style="font-size:40px;"></i>
                    <p><strong>Error Loading Step ${step}</strong></p>
                    <p>${error.message}</p>
                    <button onclick="loadStep(${step})" class="btn btn-secondary">Retry</button>
                </div>`;
        } finally {
            // Fade Step 2 back in no matter what happened
            contentDiv.style.opacity = '1';
            window.scrollTo(0, 0);
        }
    }, 300); // 300ms matches the transition time
}

/**
 * 3. Update Progress Bar & Buttons
 */
function updateUI(step) {
    const counter = document.getElementById('step-counter');
    if (counter) counter.innerText = `Step ${step} of 4`;
    
    const steps = document.querySelectorAll('.progress-bar .step');
    const connectors = document.querySelectorAll('.progress-bar .connector');

    steps.forEach((s, index) => {
        const stepNum = index + 1;
        const stepLabel = s.querySelector('.step-number');
        if (!stepLabel) return;

        if (stepNum < step) {
            s.classList.add('complete');
            s.classList.remove('active');
            stepLabel.innerHTML = '<i class="fas fa-check"></i>';
        } else if (stepNum === step) {
            s.classList.add('active');
            s.classList.remove('complete');
            stepLabel.innerText = stepNum;
        } else {
            s.classList.remove('active', 'complete');
            stepLabel.innerText = stepNum;
        }
    });

    connectors.forEach((c, index) => {
        if (index + 1 < step) c.classList.add('active');
        else c.classList.remove('active');
    });

    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    if (prevBtn) prevBtn.disabled = (step === 1);
    if (nextBtn) {
        nextBtn.innerHTML = (step === 4) ? 'Submit Application' : 'Continue <i class="fas fa-arrow-right"></i>';
    }
}

/**
 * 4. Data Handling
 */
function saveData() {
    const form = document.querySelector('.application-form');
    if (form) {
        const formData = new FormData(form);
        formData.forEach((value, key) => {
            if (!(value instanceof File)) {
                applicationData[key] = value;
            }
        });
        localStorage.setItem('applicationData', JSON.stringify(applicationData));
    }
}

function restoreData() {
    const form = document.querySelector('.application-form');
    if (!form) return;

    Object.keys(applicationData).forEach(key => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input && input.type !== 'file') {
            input.value = applicationData[key];
        }
    });
}

function initStep4() {
    const nameElem = document.getElementById('summary-name');
    const emailElem = document.getElementById('summary-email');
    const posElem = document.getElementById('summary-position');

    if (nameElem) nameElem.innerText = `${applicationData.first_name || ''} ${applicationData.last_name || ''}`;
    if (emailElem) emailElem.innerText = applicationData.email || 'N/A';
    if (posElem) posElem.innerText = applicationData.desired_position || 'N/A';
}

function initializePlugins(step) {
    if (step === 1) {
        flatpickr("#dob", {
            dateFormat: "Y-m-d", altInput: true, altFormat: "F j, Y",
            maxDate: "today", disableMobile: true,
            defaultDate: applicationData.dob || null
        });
    } else if (step === 2) {
        flatpickr("#start_date", {
            dateFormat: "Y-m-d", altInput: true, altFormat: "F j, Y",
            minDate: "today", disableMobile: true,
            defaultDate: applicationData.start_date || null
        });
    }
}

function normalizeValue(value) {
    return String(value || '').trim();
}

function normalizeLower(value) {
    return normalizeValue(value).toLowerCase();
}

function isPendingLikeStatus(status) {
    const s = normalizeLower(status);
    return s === 'pending' || s === 'for review' || s === 'under review' || s === 'in review' || s === 'for interview';
}

function isRejectedStatus(status) {
    return normalizeLower(status) === 'rejected';
}

function isApprovedStatus(status) {
    return normalizeLower(status) === 'approved';
}

function isBlacklistedStatus(status) {
    return normalizeLower(status) === 'blacklisted';
}

function daysBetweenFromNow(dateValue) {
    const ref = new Date(dateValue || 0);
    if (Number.isNaN(ref.getTime())) return 9999;
    return Math.floor((Date.now() - ref.getTime()) / (1000 * 60 * 60 * 24));
}

async function markNaughtyApplicantsBlacklisted(rows, reason, applicationPayload) {
    const ids = Array.from(new Set((rows || []).map((r) => r.id).filter(Boolean)));
    if (ids.length === 0) return;

    try {
        await _supabase
            .from('applicants')
            .update({ status: 'Blacklisted', updated_at: new Date().toISOString() })
            .in('id', ids);
    } catch (_) {}

    try {
        await fetch('/api/admin-alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'blacklist_attempt',
                reason: reason || 'Naughty duplicate application attempt',
                applicants: [{
                    id: ids.join(','),
                    name: `${applicationPayload.first_name || ''} ${applicationPayload.last_name || ''}`.trim(),
                    email: applicationPayload.email || '',
                    dob: applicationPayload.dob || '',
                    city: applicationPayload.city || ''
                }]
            })
        });
    } catch (_) {}
}

async function insertApplicantResilient(payload) {
    const MAX_RETRIES = 8;
    const row = { ...payload };

    for (let i = 0; i < MAX_RETRIES; i += 1) {
        const { data, error } = await _supabase
            .from('applicants')
            .insert([row])
            .select('id')
            .single();

        if (!error) return { data, error: null };

        const msg = String(error.message || '');
        const missingColumn =
            (msg.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i) || [])[1] ||
            (msg.match(/Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i) || [])[1];

        if (!missingColumn || !(missingColumn in row)) {
            return { data: null, error };
        }

        delete row[missingColumn];
    }

    return {
        data: null,
        error: new Error('Unable to insert applicant after removing unsupported columns.')
    };
}

/**
 * 5. Final Submission
 */
async function handleFinalSubmit() {
    const btn = document.getElementById('next-btn');
    const resumeFile = document.getElementById('resume-cv')?.files[0];
    const idFile = document.getElementById('valid-id')?.files[0];
    const idType = document.getElementById('id-type')?.value;
    const consent = document.getElementById('consent-truth')?.checked;

    if (!resumeFile || !idFile || !idType || !consent) {
        showErrorModal("Incomplete Submission", "Please complete all fields (Resume, ID Type, ID File, and Certification).");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Processing...";

    try {
        // Age Check
        const birthDate = new Date(applicationData.dob);
        const age = new Date().getFullYear() - birthDate.getFullYear();
        if (age < 21) {
            showErrorModal("Age Requirement Not Met", "Applicants must be at least 21 years old."); 
            btn.disabled = false;
            btn.innerText = "Submit Application";
            return;
        }

        // Duplicate / cooldown / blacklist checks
        const email = normalizeLower(applicationData.email);
        const firstName = normalizeValue(applicationData.first_name);
        const lastName = normalizeValue(applicationData.last_name);
        const dob = normalizeValue(applicationData.dob);

        const duplicateMap = new Map();
        if (email) {
            const { data: byEmail, error: byEmailError } = await _supabase
                .from('applicants')
                .select('id, status, first_name, last_name, email, dob, created_at, updated_at')
                .ilike('email', email)
                .limit(30);
            if (byEmailError) throw byEmailError;
            (byEmail || []).forEach((row) => duplicateMap.set(row.id, row));
        }

        if (firstName && lastName && dob) {
            const { data: byIdentity, error: byIdentityError } = await _supabase
                .from('applicants')
                .select('id, status, first_name, last_name, email, dob, created_at, updated_at')
                .ilike('first_name', firstName)
                .ilike('last_name', lastName)
                .eq('dob', dob)
                .limit(30);
            if (byIdentityError) throw byIdentityError;
            (byIdentity || []).forEach((row) => duplicateMap.set(row.id, row));
        }

        const duplicates = Array.from(duplicateMap.values());
        const exactIdentityMatches = duplicates.filter((row) =>
            normalizeLower(row.email) === email &&
            normalizeLower(row.first_name) === normalizeLower(firstName) &&
            normalizeLower(row.last_name) === normalizeLower(lastName) &&
            normalizeValue(row.dob) === dob
        );

        const hasBlacklisted = exactIdentityMatches.some((row) => isBlacklistedStatus(row.status));
        const hasPendingDuplicate = exactIdentityMatches.some((row) => isPendingLikeStatus(row.status));
        const hasApprovedDuplicate = exactIdentityMatches.some((row) => isApprovedStatus(row.status));
        const rejectedTooSoon = exactIdentityMatches.find((row) =>
            isRejectedStatus(row.status) &&
            daysBetweenFromNow(row.updated_at || row.created_at) < 30
        );

        if (hasBlacklisted) {
            showErrorModal("Application Blocked", "This profile is blacklisted and cannot apply.");
            btn.disabled = false;
            btn.innerText = "Submit Application";
            return;
        }

        if (rejectedTooSoon) {
            const remaining = Math.max(1, 30 - daysBetweenFromNow(rejectedTooSoon.updated_at || rejectedTooSoon.created_at));
            await markNaughtyApplicantsBlacklisted(
                exactIdentityMatches,
                "Applied before 1 month cooldown after rejection",
                applicationData
            );
            showErrorModal("Re-apply Not Allowed Yet", `You were rejected previously. Please wait ${remaining} more day(s) before applying again.`);
            btn.disabled = false;
            btn.innerText = "Submit Application";
            return;
        }

        if (hasPendingDuplicate || hasApprovedDuplicate) {
            await markNaughtyApplicantsBlacklisted(
                exactIdentityMatches,
                "Duplicate application attempt using same name, birthday, and email",
                applicationData
            );
            showErrorModal("Duplicate Application", "Same name, birthday, and email cannot apply again.");
            btn.disabled = false;
            btn.innerText = "Submit Application";
            return;
        }

        // File Security Checks
        const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
        const allowedResumeExt = ['pdf', 'doc', 'docx'];
        const allowedIdExt = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

        const getFileExt = (filename) => String(filename || '').split('.').pop().toLowerCase();
        const sanitizeFileName = (filename) =>
            String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');

        const resumeExt = getFileExt(resumeFile.name);
        const idExt = getFileExt(idFile.name);
        const isValidResumeType =
            allowedResumeExt.includes(resumeExt) ||
            ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(resumeFile.type);
        const isValidIdType =
            allowedIdExt.includes(idExt) ||
            idFile.type.startsWith('image/') ||
            idFile.type === 'application/pdf';

        if (!isValidResumeType) {
            showErrorModal("Invalid Resume/CV", "Allowed formats: PDF, DOC, DOCX.");
            btn.disabled = false;
            btn.innerText = "Submit Application";
            return;
        }
        if (!isValidIdType) {
            showErrorModal("Invalid ID File", "Allowed formats: image or PDF.");
            btn.disabled = false;
            btn.innerText = "Submit Application";
            return;
        }
        if (resumeFile.size > MAX_FILE_SIZE_BYTES || idFile.size > MAX_FILE_SIZE_BYTES) {
            showErrorModal("File Too Large", "Each upload must be 8MB or below.");
            btn.disabled = false;
            btn.innerText = "Submit Application";
            return;
        }

        // Uploads
        const ts = Date.now();
        const safeResumeName = sanitizeFileName(resumeFile.name);
        const safeIdName = sanitizeFileName(idFile.name);
        const resumePath = `resumes/${ts}-${safeResumeName}`;
        const idPath = `ids/id-document-${String(idType || 'unknown').replace(/\s+/g, '-').toLowerCase()}-${ts}-${safeIdName}`;

        await _supabase.storage.from('applicant-files').upload(resumePath, resumeFile);
        await _supabase.storage.from('applicant-files').upload(idPath, idFile);

        applicationData.resume_url = _supabase.storage.from('applicant-files').getPublicUrl(resumePath).data.publicUrl;
        applicationData.valid_id_url = _supabase.storage.from('applicant-files').getPublicUrl(idPath).data.publicUrl;
        applicationData.id_type = idType;
        // Backward-compatible gender persistence when DB has no dedicated gender column.
        if (applicationData.gender && !applicationData.reference) {
            applicationData.reference = `gender:${applicationData.gender}`;
        }
        applicationData.status = 'Pending';

        const { data: insertedApplicant, error: insErr } = await insertApplicantResilient(applicationData);
        if (insErr) throw insErr;
        const applicantReferenceId = insertedApplicant?.id || null;

        localStorage.clear();
        showErrorModal(
            "Application Submitted",
            applicantReferenceId
                ? `Thank you. Your application reference ID is ${applicantReferenceId}.`
                : "Thank you for your application! We will review it and get back to you soon."
        );
        window.location.href = 'index.html';

    } catch (err) {
        showErrorModal("Submission Error", err.message || "An error occurred during submission. Please try again.");
        btn.disabled = false;
        btn.innerText = "Submit Application";
    }
}

/**
 * 6. Global Event Listeners
 */
document.addEventListener('DOMContentLoaded', () => {
    
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');

    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Continue button clicked!"); // Checkpoint 1
        
            const form = document.querySelector('.application-form');
            if (form) {
                console.log("Form found!"); // Checkpoint 2
                if (!form.checkValidity()) {
                    console.log("Form is NOT valid - check required fields"); // Checkpoint 3
                    form.reportValidity();
                    return;
                }
            } else {
                console.log("Error: Form with class .application-form NOT found!");
            }
        
            console.log("Saving data and loading step:", currentStep + 1); // Checkpoint 4
            saveData();
        
            if (currentStep < 4) {
                loadStep(currentStep + 1);
            } else {
                handleFinalSubmit();
            }
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentStep > 1) {
                saveData(); // Save whatever they typed before going back
                loadStep(currentStep - 1);
            }
        });
    }

    // Load initial step
    loadStep(1);
});

/**
 * Function to trigger the Error Modal
 */
function showErrorModal(title, message) {
    const modal = document.getElementById('error-modal');
    document.getElementById('modal-error-title').innerText = title || "Error";
    document.getElementById('modal-error-msg').innerText = message || "An unexpected error occurred.";
    
    modal.classList.add('active');
}

/**
 * Function to close the Modal
 */
function closeErrorModal() {
    const modal = document.getElementById('error-modal');
    modal.classList.remove('active');
}

/**
 * Close Modal when clicking outside the content box
 */
window.addEventListener('click', function(event) {
    const modal = document.getElementById('error-modal');
    // If the user clicks the overlay (dark area) but not the content box
    if (event.target === modal) {
        closeErrorModal();
    }
});
