import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = "Wallplace <notifications@wallplace.co.uk>";
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
        <p><strong>${applicant.name}</strong> has applied to join Wallplace.</p>
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
      subject: "We received your Wallplace application",
      html: `
        <h2>Thanks for applying, ${applicant.name}!</h2>
        <p>We've received your application to join Wallplace as an artist.</p>
        <p>Our team reviews applications within 2-3 working days. We'll email you once a decision has been made.</p>
        <p>In the meantime, follow us on <a href="https://instagram.com/wallplace">Instagram</a> to see what's happening.</p>
        <br/>
        <p>The Wallplace Team</p>
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
      subject: `New message from ${recipient.senderName} on Wallplace`,
      html: `
        <h2>You have a new message</h2>
        <p><strong>${recipient.senderName}</strong> sent you a message on Wallplace:</p>
        <blockquote style="border-left: 3px solid #C17C5A; padding-left: 12px; color: #555; margin: 16px 0;">${recipient.messagePreview.slice(0, 200)}${recipient.messagePreview.length > 200 ? "..." : ""}</blockquote>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/artist-portal/messages" style="color: #C17C5A; font-weight: 600;">Reply in your portal</a></p>
        <br/>
        <p style="color: #999; font-size: 12px;">The Wallplace Team</p>
      `,
    });
  } catch (err) {
    console.error("Email send error (new message):", err);
  }
}

/**
 * Notify venue when an artist requests a placement.
 */
export async function notifyPlacementRequest(venue: {
  email: string;
  venueName: string;
  artistName: string;
  workTitles: string[];
  arrangementType: string;
  revenueSharePercent?: number;
  message?: string;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    const typeLabel = venue.arrangementType === "revenue_share"
      ? `Revenue Share (${venue.revenueSharePercent || 0}%)`
      : venue.arrangementType === "free_loan" ? "Free Loan" : "Direct Purchase";
    await resend.emails.send({
      from: FROM,
      to: venue.email,
      subject: `Placement request from ${venue.artistName}`,
      html: `
        <h2>New Placement Request</h2>
        <p><strong>${venue.artistName}</strong> would like to display work at <strong>${venue.venueName}</strong>.</p>
        <ul>
          <li><strong>Works:</strong> ${venue.workTitles.join(", ")}</li>
          <li><strong>Arrangement:</strong> ${typeLabel}</li>
        </ul>
        ${venue.message ? `<p><strong>Message:</strong></p><blockquote style="border-left: 3px solid #C17C5A; padding-left: 12px; color: #555;">${venue.message}</blockquote>` : ""}
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/venue-portal/placements" style="color: #C17C5A; font-weight: 600;">Review in your portal</a></p>
        <br/>
        <p style="color: #999; font-size: 12px;">The Wallplace Team</p>
      `,
    });
  } catch (err) {
    console.error("Email send error (placement request):", err);
  }
}

/**
 * Notify artist when venue responds to a placement request.
 */
export async function notifyPlacementResponse(artist: {
  email: string;
  artistName: string;
  venueName: string;
  accepted: boolean;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    const status = artist.accepted ? "accepted" : "declined";
    await resend.emails.send({
      from: FROM,
      to: artist.email,
      subject: `${artist.venueName} ${status} your placement request`,
      html: `
        <h2>Placement Request ${artist.accepted ? "Accepted" : "Declined"}</h2>
        <p><strong>${artist.venueName}</strong> has ${status} your placement request.</p>
        ${artist.accepted
          ? `<p>Your artwork is now confirmed for display. You can view the details in your portal.</p>`
          : `<p>You can reach out to the venue via messages if you'd like to discuss further.</p>`
        }
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/artist-portal/placements" style="color: #C17C5A; font-weight: 600;">View in your portal</a></p>
        <br/>
        <p style="color: #999; font-size: 12px;">The Wallplace Team</p>
      `,
    });
  } catch (err) {
    console.error("Email send error (placement response):", err);
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

/**
 * Notify artist when a new order is placed for their work.
 */
export async function notifyArtistNewOrder(order: {
  email: string;
  artistName: string;
  orderId: string;
  itemTitle: string;
  total: number;
  artistRevenue: number;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: order.email,
      subject: `New order: ${order.itemTitle}`,
      html: `
        <h2>You have a new order!</h2>
        <p><strong>${order.itemTitle}</strong> has been purchased.</p>
        <ul>
          <li><strong>Order ID:</strong> ${order.orderId}</li>
          <li><strong>Total:</strong> &pound;${order.total.toFixed(2)}</li>
          <li><strong>Your revenue:</strong> &pound;${order.artistRevenue.toFixed(2)}</li>
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/artist-portal/orders" style="color: #C17C5A; font-weight: 600;">View in your portal</a></p>
        <br/>
        <p style="color: #999; font-size: 12px;">The Wallplace Team</p>
      `,
    });
  } catch (err) {
    console.error("Email send error (artist new order):", err);
  }
}

/**
 * Notify buyer when order status is updated.
 */
export async function notifyBuyerStatusUpdate(buyer: {
  email: string;
  orderId: string;
  status: string;
  trackingNumber?: string;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    const statusLabels: Record<string, string> = { processing: "is being prepared", shipped: "has been shipped", delivered: "has been delivered" };
    const statusText = statusLabels[buyer.status] || `status: ${buyer.status}`;
    await resend.emails.send({
      from: FROM,
      to: buyer.email,
      subject: `Order ${buyer.orderId} ${statusText}`,
      html: `
        <h2>Order Update</h2>
        <p>Your order <strong>${buyer.orderId}</strong> ${statusText}.</p>
        ${buyer.trackingNumber ? `<p><strong>Tracking number:</strong> ${buyer.trackingNumber}</p>` : ""}
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/customer-portal/orders" style="color: #C17C5A; font-weight: 600;">Track your order</a></p>
        <br/>
        <p style="color: #999; font-size: 12px;">The Wallplace Team</p>
      `,
    });
  } catch (err) {
    console.error("Email send error (buyer status update):", err);
  }
}

/**
 * Notify venue when their placement generates a sale.
 */
export async function notifyVenueOrderFromPlacement(venue: {
  email: string;
  venueName: string;
  artistName: string;
  itemTitle: string;
  total: number;
  venueRevenue: number;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: venue.email,
      subject: `Sale from your venue: ${venue.itemTitle}`,
      html: `
        <h2>A sale was made from your venue!</h2>
        <p><strong>${venue.itemTitle}</strong> by ${venue.artistName} was purchased from ${venue.venueName}.</p>
        <ul>
          <li><strong>Sale total:</strong> &pound;${venue.total.toFixed(2)}</li>
          <li><strong>Your revenue share:</strong> &pound;${venue.venueRevenue.toFixed(2)}</li>
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/venue-portal/orders" style="color: #C17C5A; font-weight: 600;">View in your portal</a></p>
        <br/>
        <p style="color: #999; font-size: 12px;">The Wallplace Team</p>
      `,
    });
  } catch (err) {
    console.error("Email send error (venue order from placement):", err);
  }
}

/**
 * Notify artist and admin when a refund is requested.
 */
export async function notifyRefundRequested(params: {
  artistEmail?: string;
  artistName?: string;
  requesterName: string;
  requesterType: string;
  orderId: string;
  reason: string;
  amount: number;
  type: "full" | "partial";
}) {
  const resend = getResend();
  if (!resend) return;
  const typeLabel = params.type === "full" ? "Full refund" : `Partial refund (\u00a3${params.amount.toFixed(2)})`;
  // Notify admin
  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `Refund request for order ${params.orderId}`,
      html: `
        <h2>Refund Requested</h2>
        <ul>
          <li><strong>Order:</strong> ${params.orderId}</li>
          <li><strong>Requester:</strong> ${params.requesterName} (${params.requesterType})</li>
          <li><strong>Type:</strong> ${typeLabel}</li>
          <li><strong>Reason:</strong> ${params.reason}</li>
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin">Review in admin dashboard</a></p>
      `,
    });
  } catch (err) {
    console.error("Email send error (admin refund request):", err);
  }
  // Notify artist
  if (params.artistEmail) {
    try {
      await resend.emails.send({
        from: FROM,
        to: params.artistEmail,
        subject: `Refund request for order ${params.orderId}`,
        html: `
          <h2>A refund has been requested</h2>
          <p>Hi ${params.artistName || "there"},</p>
          <p>A ${params.type} refund has been requested for order <strong>${params.orderId}</strong>.</p>
          <ul>
            <li><strong>Type:</strong> ${typeLabel}</li>
            <li><strong>Reason:</strong> ${params.reason}</li>
          </ul>
          <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/artist-portal/orders" style="color: #C17C5A; font-weight: 600;">Review in your portal</a></p>
          <br/>
          <p style="color: #999; font-size: 12px;">The Wallplace Team</p>
        `,
      });
    } catch (err) {
      console.error("Email send error (artist refund request):", err);
    }
  }
}

/**
 * Notify buyer when their refund request is approved or rejected.
 */
export async function notifyRefundDecision(params: {
  buyerEmail: string;
  orderId: string;
  approved: boolean;
  reason?: string;
  amount?: number;
}) {
  const resend = getResend();
  if (!resend) return;
  try {
    const status = params.approved ? "approved" : "rejected";
    await resend.emails.send({
      from: FROM,
      to: params.buyerEmail,
      subject: `Refund ${status} for order ${params.orderId}`,
      html: `
        <h2>Refund ${params.approved ? "Approved" : "Rejected"}</h2>
        <p>Your refund request for order <strong>${params.orderId}</strong> has been <strong>${status}</strong>.</p>
        ${params.approved && params.amount ? `<p>A refund of <strong>\u00a3${params.amount.toFixed(2)}</strong> will be returned to your original payment method within 5-10 business days.</p>` : ""}
        ${params.reason ? `<p><strong>Reason:</strong> ${params.reason}</p>` : ""}
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/customer-portal/orders" style="color: #C17C5A; font-weight: 600;">View your orders</a></p>
        <br/>
        <p style="color: #999; font-size: 12px;">The Wallplace Team</p>
      `,
    });
  } catch (err) {
    console.error("Email send error (refund decision):", err);
  }
}
