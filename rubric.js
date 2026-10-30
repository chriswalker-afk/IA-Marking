/* Independent, teacher-friendly summaries of every mark level in the
 * Mathematics A-E exploration rubric (first assessment 2021, through 2028).
 * These are ORIGINAL PARAPHRASES, not the IB's licensed descriptor wording.
 * The authoritative wording remains in the IB Mathematics subject guides.
 * Criteria A-D are common to SL and HL; Criterion E is course-level specific.
 */
window.IA_RUBRIC = Object.freeze({
  A: {
    focus: 'Organisation, logical development and concision of the exploration.',
    considerations: [
      'Does the exploration progress logically from an identified aim through its mathematics to a conclusion?',
      'Are graphs, figures and tables located where their evidence is discussed?',
      'Is the mathematics explained without unnecessary repetition or irrelevant material?'
    ],
    levels: [
      'The work does not yet show sufficient coherence or organisation for a positive mark.',
      'A little structure or logical connection is apparent, but development is difficult to follow.',
      'Some logical continuity and some organisation are present, although the structure remains uneven.',
      'The investigation follows a coherent mathematical argument and is organised clearly.',
      'The investigation is coherent, well organised and concise, without material that distracts from its aim.'
    ]
  },
  B: {
    focus: 'Relevance, appropriateness and consistency of mathematical communication.',
    considerations: [
      'Are variables, technical language, mathematical symbols and notation appropriate and defined when needed?',
      'Are tables, graphs, diagrams and equations labelled and incorporated appropriately?',
      'Are mathematical explanations and deductions communicated clearly and consistently?'
    ],
    levels: [
      'There is insufficient appropriate mathematical communication for a positive mark.',
      'Some useful mathematical communication appears, but aspects of its notation or presentation are unsuitable.',
      'Appropriate mathematical notation or representations appear in relevant places, but consistency is limited.',
      'The mathematical communication is relevant, suitable and mostly consistent across the exploration.',
      'Mathematical terms, notation and representations are relevant, suitable and consistently used throughout.'
    ]
  },
  C: {
    focus: 'Personal mathematical ownership demonstrated in the exploration itself, rather than effort alone.',
    considerations: [
      'Can the teacher identify authentic independent decisions or mathematical ideas?',
      'Do choices, conjectures, alternative approaches or predictions influence the direction of the work?',
      'Is the student’s own perspective visible through meaningful mathematical exploration?'
    ],
    levels: [
      'The submitted exploration shows no identifiable personal mathematical engagement.',
      'There is some evidence that the student makes the exploration their own.',
      'Authentic independent mathematical choices are evident at significant points and help advance the exploration.',
      'Sustained, high-quality personal mathematical engagement gives the investigation a distinctive direction.'
    ]
  },
  D: {
    focus: 'How the student reviews, interprets and evaluates the exploration and its mathematics.',
    considerations: [
      'Does reflection go beyond simply restating calculations or describing results?',
      'Does the student examine the aim, implications, limitations or competing approaches?',
      'Is critical reflection mathematically significant and does it develop the investigation?'
    ],
    levels: [
      'There is no identifiable reflection reaching the minimum criterion standard.',
      'Reflection is limited: results are mainly described or briefly commented upon.',
      'Meaningful reflection considers the aim, what was learnt, limitations or alternative mathematics.',
      'Critical, insightful reflection is substantial and influences the interpretation or development of the work.'
    ]
  },
  E: {
    focus: 'Selection, accuracy and demonstrated understanding of mathematics appropriate to the course level.',
    considerations: [
      'Is the mathematics relevant to meeting the exploration’s aim rather than complexity for its own sake?',
      'Does the work demonstrate knowledge and understanding, rather than merely supplying calculator outputs?',
      'For HL, does the mathematical development show the additional precision, sophistication and rigour expected?'
    ],
    SL: [
      'The mathematics does not meet the minimum level for a positive mark.',
      'Some mathematics relevant to the investigation has been used.',
      'Relevant mathematics appears, with only a limited explanation of its meaning or method.',
      'The mathematics is appropriate to the course level, but demonstrated understanding remains limited.',
      'The mathematics is course-appropriate and partly correct, with some evidenced understanding.',
      'The mathematics is appropriate and mostly correct, with good understanding shown.',
      'The mathematics is relevant, appropriate and correct, with thorough understanding evidenced throughout.'
    ],
    HL: [
      'The mathematics does not meet the minimum level for a positive mark.',
      'Some relevant mathematics appears, with limited understanding demonstrated.',
      'Some relevant mathematics is partly correct, with some demonstrated understanding.',
      'The mathematics is appropriate to the HL course, correct and supported by some understanding.',
      'Appropriate mathematics is correct and supported by good mathematical understanding.',
      'Appropriate, correct mathematics shows sophistication OR rigour, with thorough understanding.',
      'Appropriate, precise mathematics shows sophistication AND rigour, with thorough understanding.'
    ]
  }
});
