/**
 * data/projects.js
 *
 * The canonical project content for the portfolio, and the single source of
 * truth for two things:
 *
 *   1. the offline fallback, served whenever MongoDB is unreachable, and
 *   2. the input to `npm run seed`, which upserts these into MongoDB.
 *
 * Content rules — these are not negotiable:
 *
 *   * `githubUrl` and `liveUrl` are EMPTY STRINGS when no URL exists. The UI
 *     then renders no button at all. Never put a placeholder, a guessed URL or
 *     a "#" in these fields.
 *   * `image` is an empty string until a screenshot exists; the card renders a
 *     labelled placeholder instead of a broken image.
 *   * Nothing here may be invented. If a fact is unknown it is omitted.
 */

module.exports = [
  /* ------------------------------------------------------------------
     FEATURED
     ------------------------------------------------------------------ */

{
    title: 'KisaanMitra AI',
    shortDescription: 'AI-Powered Farming Assistant',
    category: 'AI / Agriculture',
    year: 2026,
    featured: true,
    order: 1,

    problem:
      'Farmers often struggle to access timely and reliable information about ' +
      'weather, crop health, market prices, and government schemes. Relevant ' +
      'information is spread across multiple sources and can be difficult to navigate.',

    solution:
      'KisaanMitra AI brings essential farming assistance into a single platform. ' +
      'It uses the Gemini API to provide conversational guidance along with ' +
      'weather insights, crop intelligence, disease detection, market information, ' +
      'and government scheme discovery.',

    features: [
      'AI-powered conversational farming assistant',
      'Weather information for better agricultural planning',
      'Crop intelligence and crop disease analysis',
      'Market information and price guidance',
      'Government scheme discovery and information',
      'Farmer-friendly and multilingual interaction'
    ],

    technologies: [
      'HTML',
      'CSS',
      'JavaScript',
      'EJS',
      'Node.js',
      'Express.js',
      'MongoDB',
      'Gemini API'
    ],

    image: '/asset/images/kisaanScreenshot.png',
    imageAlt: 'Screenshot of kisaanMItra AI application',
    placeholderIcon: 'sprout',

    githubUrl: 'https://github.com/Khushalpaunkar/KisaanMitra-AI',
    liveUrl: 'https://kisaanmitra-ai.onrender.com/'
},



  {
    title: 'ResumeCraft',
    shortDescription: 'Prompt-to-resume builder with template selection',
    category: 'AI / React',
    year: 2025,
    featured: true,
    order: 2,

    problem:
      'Building a resume from scratch is slow, and generic builders give little ' +
      'control over wording. Most people know their experience but not how to ' +
      'phrase it.',

    solution:
      'A React application where a user describes themselves in their own ' +
      'words, an AI model turns that into structured resume content, and the ' +
      'result is placed into a selectable template.',

    features: [
      'React-based single-page application',
      'Natural-language prompt input',
      'AI model generates structured resume content',
      'Multiple selectable resume templates',
    ],

    technologies: ['React', 'JavaScript', 'AI Model API', 'Node.js',
      'Express.js',
      'MongoDB',  'Gemini API'],

    // No screenshot yet.
    image: '/asset/images/resumeCraftimg.png',
    imageAlt: '',
    placeholderIcon: 'document',

    // No repository URL has been provided. Left empty on purpose.
    githubUrl: 'https://github.com/Khushalpaunkar/ResumeCraft',
    liveUrl: '',
  },

  /* ------------------------------------------------------------------
     MORE PROJECTS
     ------------------------------------------------------------------ */
  {
    title: 'Lost & Found',
    shortDescription:
      'A smart asset recovery system that connects people who find lost items on campus with the people who lost them.',
    category: 'Full-Stack',
    year: null,
    featured: false,
    order: 1,

    // Contextual label shown as a badge, e.g. the course this was built for.
    tags: ['4th Sem Mini project'],

    technologies: ['HTML',
      'CSS',
      'JavaScript',
      'EJS',
      'Node.js',
      'Express.js',
      'MongoDB', ],

    image: '/asset/images/lost-found.png',
    imageAlt: 'Lost and Found web application interface',
    placeholderIcon: 'search',

    githubUrl: 'https://github.com/Khushalpaunkar/Lost-Found-JDCoem',
    liveUrl: '',
  },

  {
    title: 'Random Joke Generator',
    shortDescription:
      'A small web app that fetches and displays a random joke, built to practise working with a third-party API.',
    category: 'Frontend',
    year: null,
    featured: false,
    order: 2,

    tags: [],

    technologies: ['HTML', 'CSS', 'JavaScript'],

    image: '/asset/images/random-joke-generator.png',
    imageAlt: 'Random Joke Generator web application',
    placeholderIcon: 'joke',

    githubUrl: 'https://github.com/Khushalpaunkar/Random-joke-generator',
    liveUrl: '',
  },

  // {
  //   title: 'Portfolio V2',
  //   shortDescription:
  //     'This site. Server-rendered with Node.js, Express and EJS, backed by MongoDB for projects and contact messages.',
  //   category: 'Full-Stack',
  //   year: 2026,
  //   featured: false,
  //   order: 3,

  //   tags: [],

  //   technologies: ['EJS', 'Node.js', 'Express.js', 'MongoDB'],

  //   image: '/asset/images/portfolio.png',
  //   imageAlt: 'Khushal Paunkar portfolio website',
  //   placeholderIcon: 'code',

  //   // Not public yet.
  //   githubUrl: '',
  //   liveUrl: '',
  // },

  {
    title: 'CodeOrigin',
    shortDescription:
      'An AI-powered platform that analyzes source code repositories to identify patterns associated with human-written and AI-generated code. ',
    category: 'Full-Stack',
    year: 2026,
    featured: false,
    order: 3,

    tags: [],

    technologies: [ 'HTML' , 'CSS',
      'JavaScript','EJS', 'Node.js', 'Express.js', 'MongoDB'],

    image: '/asset/images/CodeOrigin.png',
    imageAlt: 'Screenshot of the CodeOrigin application',
    placeholderIcon: 'code',

    // Not public yet.
    githubUrl: 'https://github.com/Khushalpaunkar/CODEORIGIN-AI',
    liveUrl: '',
  },

  
];
