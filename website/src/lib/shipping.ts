/**
 * Carrier detection from tracking number format.
 * Returns carrier name and tracking URL, or null if unrecognised.
 */

interface CarrierInfo {
  carrier: string;
  trackingUrl: string;
}

export function detectCarrier(trackingNumber: string): CarrierInfo | null {
  const num = trackingNumber.trim().toUpperCase();

  // Royal Mail, 2 letters, 9 digits, 2 letters (e.g. RM123456789GB)
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(num)) {
    return {
      carrier: "Royal Mail",
      trackingUrl: `https://www.royalmail.com/track-your-item#/tracking-results/${num}`,
    };
  }

  // DPD, 14 digits
  if (/^\d{14}$/.test(num)) {
    return {
      carrier: "DPD",
      trackingUrl: `https://track.dpd.co.uk/parcels/${num}`,
    };
  }

  // Evri (Hermes), starts with H + 15 digits, or 16 digits
  if (/^H?\d{15,16}$/.test(num)) {
    return {
      carrier: "Evri",
      trackingUrl: `https://www.evri.com/track/parcel/${num}`,
    };
  }

  // DHL, 10 or 12 digits, or starts with JD/JJD
  if (/^\d{10,12}$/.test(num) || /^J{1,2}D\d{18,20}$/.test(num)) {
    return {
      carrier: "DHL",
      trackingUrl: `https://www.dhl.co.uk/en/express/tracking.html?AWB=${num}`,
    };
  }

  // UPS, 1Z + 16 alphanumeric
  if (/^1Z[A-Z0-9]{16}$/.test(num)) {
    return {
      carrier: "UPS",
      trackingUrl: `https://www.ups.com/track?tracknum=${num}`,
    };
  }

  // FedEx, 12 or 15 digits
  if (/^\d{12}$/.test(num) || /^\d{15}$/.test(num)) {
    return {
      carrier: "FedEx",
      trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${num}`,
    };
  }

  // Parcelforce, 2 letters + 7 digits + 2 letters
  if (/^[A-Z]{2}\d{7}[A-Z]{2}$/.test(num)) {
    return {
      carrier: "Parcelforce",
      trackingUrl: `https://www.parcelforce.com/track-trace?trackNumber=${num}`,
    };
  }

  return null;
}
