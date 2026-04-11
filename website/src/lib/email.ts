import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = "Wallspace <notifications@wallspace.art>";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "fcoles2598@gmail.com";

/**
 * Notify admin when a new artist application is submitted.
 */
export async function notifyAdminNewApplication(applicant: {
  name: string;
  email: string;
  location: string;
  primaryMedium: string;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `New artist application: ${applicant.name}`,
      html: `
        <h2>New Artist Application</h2>
        <p><strong>${applicant.name}</strong> has applied to join Wallspace.</p>
        <ul>
          <li><strong>Email:</strong> ${applicant.email}</li>
          <li><strong>Location:</strong> ${applicant.location}</li>
          <li><strong>Medium:</strong> ${applicant.primaryMedium}</li>
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin">Review in admin dashboard</a></p>
      `,
    });
  } catch (err) {
    console.error("Email send error (admin application):", err);
  }
}

/**
 * Confirm receipt of application to the artist.
 */
export async function confirmApplicationToArtist(applicant: {
  name: string;
  email: string;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: applicant.email,
      subject: "We received your Wallspace application",
      html: `
        <h2>Thanks for applying, ${applicant.name}!</h2>
        <p>We've received your application to join Wallspace as an artist.</p>
        <p>Our team reviews applications within 2-3 working days. We'll email you once a decision has been made.</p>
        <p>In the meantime, follow us on <a href="https://instagram.com/wallspace.art">Instagram</a> to see what's happening.</p>
        <br/>
        <p>The Wallspace Team</p>
      `,
    });
  } catch (err) {
    console.error("Email send error (application confirm):", err);
  }
}

/**
 * Notify admin of a new enquiry.
 */
export async function notifyAdminNewEnquiry(enquiry: {
  senderName: string;
  senderEmail: string;
  artistSlug: string;
  enquiryType: string;
  message: string;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `New enquiry for ${enquiry.artistSlug} from ${enquiry.senderName}`,
      html: `
        <h2>New Enquiry</h2>
        <ul>
          <li><strong>From:</strong> ${enquiry.senderName} (${enquiry.senderEmail})</li>
          <li><strong>Artist:</strong> ${enquiry.artistSlug}</li>
          <li><strong>Type:</strong> ${enquiry.enquiryType}</li>
        </ul>
        <p><strong>Message:</strong></p>
        <blockquote style="border-left: 3px solid #C17C5A; padding-left: 12px; color: #555;">${enquiry.message}</blockquote>
      `,
    });
  } catch (err) {
    console.error("Email send error (enquiry):", err);
  }
}

/**
 * Notify admin of a new contact form submission.
 */
export async function notifyAdminNewContact(contact: {
  name: string;
  email: string;
  type: string;
  message: string;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `New contact message from ${contact.name}`,
      html: `
        <h2>Contact Form Submission</h2>
        <ul>
          <li><strong>Name:</strong> ${contact.name}</li>
          <li><strong>Email:</strong> ${contact.email}</li>
          <li><strong>Type:</strong> ${contact.type}</li>
        </ul>
        <p><strong>Message:</strong></p>
        <blockquote style="border-left: 3px solid #C17C5A; padding-left: 12px; color: #555;">${contact.message}</blockquote>
      `,
    });
  } catch (err) {
    console.error("Email send error (contact):", err);
  }
}

/**
 * Notify a user when they receive a new message.
 */
export async function notifyNewMessage(recipient: {
  email: string;
  name: string;
  senderName: string;
  messagePreview: string;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: recipient.email,
      subject: `New message from ${recipient.senderName} on Wallspace`,
      html: `
        <h2>You have a new message</h2>
        <p><strong>${recipient.senderName}</strong> sent you a message on Wallspace:</p>
        <blockquote style="border-left: 3px solid #C17C5A; padding-left: 12px; color: #555; margin: 16px 0;">${recipient.messagePreview.slice(0, 200)}${recipient.messagePreview.length > 200 ? "..." : ""}</blockquote>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/artist-portal/messages" style="color: #C17C5A; font-weight: 600;">Reply in your portal</a></p>
        <br/>
        <p style="color: #999; font-size: 12px;">The Wallspace Team</p>
      `,
    });
  } catch (err) {
    console.error("Email send error (new message):", err);
  }
}

/**
 * Notify admin when a new venue registers.
 */
export async function notifyAdminNewVenue(venue: {
  name: string;
  contactName: string;
  email: string;
  type: string;
  location: string;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `New venue registration: ${venue.name}`,
      html: `
        <h2>New Venue Registration</h2>
        <ul>
          <li><strong>Venue:</strong> ${venue.name}</li>
          <li><strong>Contact:</strong> ${venue.contactName} (${venue.email})</li>
          <li><strong>Type:</strong> ${venue.type}</li>
          <li><strong>Location:</strong> ${venue.location}</li>
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin">Review in admin dashboard</a></p>
      `,
    });
  } catch (err) {
    console.error("Email send error (venue registration):", err);
  }
}
