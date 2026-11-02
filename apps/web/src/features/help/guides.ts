export const audiences = ['streamers', 'moderators', 'viewers'] as const;
export type GuideAudience = (typeof audiences)[number];
export const guideViews = {
  discover: 'discover',
  team: 'team',
  streamer: 'streamer',
  publications: 'publications',
  overlay: 'overlay',
  moderation: 'moderation',
  workflows: 'workflows',
  community: 'community',
  candidates: 'candidates',
  sampleAppeal: 'moderation',
  sampleReference: 'community',
  sampleImage: 'community',
  sampleClip: 'community',
} as const;
export type GuideView = keyof typeof guideViews;
export function demoGuideHref(view: GuideView) {
  if (view === 'sampleAppeal')
    return '/demo?view=case&case=00000000-0000-4000-8000-000000003001&channel=00000000-0000-4000-8000-000000000001';
  const entries = {
    sampleReference: '00000000-0000-4000-8000-000000007001',
    sampleImage: '00000000-0000-4000-8000-000000007002',
    sampleClip: '00000000-0000-4000-8000-000000007005',
  };
  if (
    view === 'sampleReference' ||
    view === 'sampleImage' ||
    view === 'sampleClip'
  )
    return `/demo?view=community&entry=${entries[view]}`;
  return `/demo?view=${guideViews[view]}`;
}
type GuideStep = {
  id: string;
  title: string;
  body: string;
  detail: string;
  view: GuideView;
  action: string;
};
type Guide = {
  label: string;
  title: string;
  description: string;
  steps: GuideStep[];
  questions: { question: string; answer: string }[];
};
export const guides: Record<GuideAudience, Guide> = {
  streamers: {
    label: 'Streamers & teams',
    title: 'Get your next stream ready',
    description:
      'Connect your channel, keep promises and share the parts your community should remember.',
    steps: [
      {
        id: 'setup',
        title: 'Connect and choose your team',
        body: 'Sign in with Twitch, connect your own channel, then open Teams. Add people after they have signed in to Lore. Team members can prepare stories; owners and moderators can approve them.',
        detail:
          'Assigning Moderator also grants Twitch moderation and may request additional Twitch permission. Signing in alone does not enable capture, AI or chat replies. Owners control these in Channel settings.',
        view: 'team',
        action: 'Open Teams',
      },
      {
        id: 'promises',
        title: 'Save a promise, then follow through',
        body: 'Add a promise in Promises, or enable live capture and type !promise followed by the commitment in Twitch chat as the broadcaster or a moderator. The next-stream brief puts in-progress work first.',
        detail:
          'Ordinary chat and microphone suggestions need human review in Suggestions. Check the quoted source and edit the wording before confirming. Mark work fulfilled with a completion note, or postpone it when plans change.',
        view: 'streamer',
        action: 'Try a promise',
      },
      {
        id: 'publishing',
        title: 'Turn a moment into a public story',
        body: 'Open Public stories and save a draft. Add an optional Twitch clip URL; after saving, open the draft to attach a screenshot with a description. Review the text, media and chat wording before approving publication.',
        detail:
          'For a recap, choose currently published sources under Create a recap. Editing a published story returns it to draft and withdraws dependent recaps until reviewed again. Private case notes are never public story sources.',
        view: 'publications',
        action: 'Open Public stories',
      },
      {
        id: 'overlay',
        title: 'Show approved context in OBS',
        body: 'In Stream overlay, choose a mode and published entries. Review the display preview and approve that exact selection. As owner, open OBS setup, create the browser-source link and copy it into an OBS Browser Source.',
        detail:
          'Keep the whole link private: it includes a credential. Lore reveals a newly created link once. If you lose it, regenerate it and replace it in OBS. Turn visibility on after approval. A blank overlay can mean visibility is off, no approved entries remain, a source changed, or the link was revoked.',
        view: 'overlay',
        action: 'Try the overlay preview',
      },
    ],
    questions: [
      {
        question: 'Why is a feature unavailable?',
        answer:
          'Check the selected channel, your Lore role and whether the channel is connected. Owner-only features may need separate Twitch permission, owner opt-in or provider configuration. Follow the access message beside that feature.',
      },
      {
        question: 'Will !catchup reply automatically?',
        answer:
          'The owner must authorize chat replies and enable them in Public stories. !catchup shares the reviewed public summary. It does not generate or publish a new recap when someone asks.',
      },
      {
        question: 'How do microphone suggestions work?',
        answer:
          'The owner first enables microphone suggestions. In Suggestions, record up to 30 seconds, preview it locally, then choose whether to submit it to Gemini. Review the transcript and each suggested promise before confirming. Audio is not retained by Lore.',
      },
      {
        question: 'What is safe to try in the demo?',
        answer:
          'Demo edits, chat commands, AI reviews and OBS credentials are simulations local to your visit. Reset restores the sample data. The optional sample clip opens a real Twitch player; demo screenshot uploads stay in browser memory.',
      },
    ],
  },
  moderators: {
    label: 'Moderators',
    title: 'Review with context. Leave a clear handoff.',
    description:
      'Keep incident evidence, human decisions and follow-up work connected inside your channel.',
    steps: [
      {
        id: 'access',
        title: 'Start with the correct channel',
        body: 'The channel owner must grant you a Lore Moderator role. Choose the channel in the header, then open Moderation cases. Twitch moderator status alone does not grant access to private Lore records.',
        detail:
          'Owners can optionally import new moderation events after granting permission and enabling the feature. You can also create a case manually. Imported events open a review; they do not decide it.',
        view: 'moderation',
        action: 'Open moderation cases',
      },
      {
        id: 'decision',
        title: 'Read the case before deciding',
        body: 'Open the incident and rule, inspect Evidence, then use Review & decision. If precedent assistance is enabled, compare the cited earlier cases, rule versions, gaps and uncertainty.',
        detail:
          'A similar earlier case is context, not proof. You can use an AI draft to fill the form, but must review it, write a rationale and explicitly save the human decision. A saved Lore decision does not ban, unban or change a timeout on Twitch.',
        view: 'sampleAppeal',
        action: 'Review a case',
      },
      {
        id: 'follow-up',
        title: 'Keep follow-up work visible',
        body: 'Under Follow-up, record repair or re-entry actions with an assignee. Complete or cancel them with a note. Review consistency concerns by comparing the actual incidents, evidence and applicable rule versions.',
        detail:
          'Different outcomes can be justified. A concern asks for a review, not an automatic reversal. Final decisions remain in case history; subsequent reviews and repair notes preserve what happened.',
        view: 'workflows',
        action: 'Open the shift desk',
      },
      {
        id: 'handoff',
        title: 'Prepare the next shift',
        body: 'In the shift desk, review unresolved tasks and generate a handoff. Read its saved period, decisions and rule changes. Acknowledge assigned tasks, then resolve them with a useful note.',
        detail:
          'A handoff is a snapshot. A new shift still needs to acknowledge its own tasks. Case files and internal handoffs stay private; publish community updates separately through Public stories.',
        view: 'workflows',
        action: 'Read a handoff',
      },
    ],
    questions: [
      {
        question: 'Why can’t I edit a final decision?',
        answer:
          'Final decisions are retained as read-only records. Use follow-up actions and consistency reviews to document what needs attention without rewriting the original decision.',
      },
      {
        question: 'Why is evidence missing?',
        answer:
          'Ordinary chat expires under the channel’s retention setting. Retained case evidence is separate, but a source can be unavailable or removed. Review only what is available and record the gap rather than assuming what it said.',
      },
      {
        question: 'Can team members see private cases?',
        answer:
          'Private moderation cases, evidence and shift workflows are limited to channel owners and authorized moderators. Team members can help with promises and public drafts without gaining private case access.',
      },
    ],
  },
  viewers: {
    label: 'Viewers & newcomers',
    title: 'Find your place in the community',
    description:
      'Catch up on the latest story, learn the references and find out what is coming next. No account needed.',
    steps: [
      {
        id: 'discover',
        title: 'Find a community',
        body: 'Use Discover to search for channels by name. Open a result to see the stories and context that community has chosen to publish.',
        detail:
          'Lore lists communities with a public presence here. It is not a directory of every Twitch channel, and unpublished channel records do not appear.',
        view: 'community',
        action: 'Visit a community',
      },
      {
        id: 'catchup',
        title: 'Get the short version',
        body: 'Start with Catch up for the latest approved recap, then browse Stories, Inside references or Plans & promises. Select a story to read its full context and linked sources.',
        detail:
          'A recap may be absent if nothing has been approved yet or one of its sources changed. The community page still shows the other currently published stories.',
        view: 'community',
        action: 'Read the catch-up',
      },
      {
        id: 'ask',
        title: 'Ask about the community',
        body: 'Open Ask about the community to ask about a reference, a recent stream or a published plan. Follow the answer’s story links to read its sources.',
        detail:
          'The guide answers from approved public text. It cannot see private chat, appeals or moderator notes. If the published material does not answer your question, it should say so. AI answers can be mistaken; check the linked stories.',
        view: 'community',
        action: 'Try the community guide',
      },
      {
        id: 'moments',
        title: 'Watch a shared moment',
        body: 'Open a story with an attached clip or image. Load Twitch clip starts the Twitch player only when you choose it. On a small screen, Open on Twitch takes you to the clip.',
        detail:
          'Video stays hosted on Twitch and may become unavailable. The written story and image description remain useful. A community can withdraw a story, so shared links may stop displaying it.',
        view: 'sampleClip',
        action: 'Explore shared moments',
      },
    ],
    questions: [
      {
        question: 'Do I need to sign in?',
        answer:
          'No. Discover, published community stories and catch-up pages are available without an account. Sign-in is for channel owners and their authorized teams.',
      },
      {
        question: 'Can I see someone’s moderation history?',
        answer:
          'No. Viewer pages and the community guide use approved public stories. Private case files, evidence and internal team notes are not available to viewers.',
      },
      {
        question: 'Why is the community guide missing?',
        answer:
          'The channel owner can turn it off. If it is visible but unavailable, try again later or use the published stories and their source links directly.',
      },
    ],
  },
};
