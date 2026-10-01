// Display constants for the demo shell. Change the repository URL here if the repo moves.

export const REPO_URL = 'https://github.com/steinberger528/Justinos-demo'

/** The fictional operator the sample data belongs to. */
export const OPERATOR = {
  firstName: 'Jordan',
  initials: 'JA',
  /** Shown in the top rail. A fixed place, since the demo never asks for a visitor's location. */
  location: 'Columbus, OH',
  latitude: 39.9612,
  longitude: -82.9988,
}

// Voice notes and photos of handwriting both need a server in production: speech to
// text for one, a vision model for the other. A static site has neither, so the demo
// leaves the recording code in place and switches the two entry points off.
export const VOICE_CAPTURE_ENABLED: boolean = false
export const PHOTO_CAPTURE_ENABLED: boolean = false

// Production opens the Briefing by itself once a morning, between 07:00 and 10:00,
// because the dashboard is left open overnight. A demo visitor arrives cold, and a
// modal over the first page they see would hide the note that explains the tab. The
// Briefing button on the Session card still opens it.
export const BRIEFING_AUTO_OPEN: boolean = false

export const VOICE_OFF_MESSAGE ='Voice notes are transcribed on the server in production. That is switched off in this demo, so type it instead.'
export const PHOTO_OFF_MESSAGE = 'Photos of handwriting are read by a vision model in production. That is switched off in this demo, so type it instead.'
