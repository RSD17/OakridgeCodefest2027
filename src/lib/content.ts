// Site content

export const site = {
  name: "Oakridge Codefest 2027",
  edition: "V10",
  tagline: "Code. Create. Conquer.",
  eventDateLabel: "5th–6th Feb, 2027",
  // Countdown target
  countdownTargetISO: "2027-02-05T00:00:00+05:30",
  email: "codefest@oakridge.in",
  instagram: {
    label: "Oakridge Codefest",
    href: "https://www.instagram.com/oakridgecodefest/",
  },
  website: {
    label: "codefest.oakridge.in",
    href: "https://codefest.oakridge.in",
  },
  mapsHref: "https://maps.app.goo.gl/DZmkLwyBAA6mcQ5f6",
  phoneTeacher: "+91 97402 55229",
  phoneCoreTeam: "+91 99027 94849",
} as const;

export type NavItem = {
  label: string;
  href: string;
  external?: boolean;
};

// Navigation
export const navItems: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "Themes", href: "/coming-soon" },
  { label: "Event Details", href: "/coming-soon" },
  { label: "Resources", href: "/coming-soon" },
  { label: "Register", href: "/coming-soon" },
  { label: "Dashboard", href: "/coming-soon" },
];

export const homeAbout = {
  heading: "About Oakridge Codefest 2027",
  paragraphs: [
    "Oakridge Codefest 2027 is an exhilarating 24-hour hackathon that brings together passionate coders, developers, and tech enthusiasts to innovate, collaborate, and create cutting-edge solutions. Hosted at Oakridge International School, this event offers a unique platform for participants to showcase their skills, learn from industry experts, and network with like-minded individuals. Whether you're a seasoned programmer or a beginner eager to dive into the world of coding, Oakridge Codefest 2027 promises an unforgettable experience filled with creativity, teamwork, and technological breakthroughs. Join us for a weekend of coding challenges, workshops, and fun as we push the boundaries of innovation!",
    "The competition process includes 24 hours to build a project based on the given themes. These projects are then evaluated based on the code, idea, audits and originality to be able to decide finalists from each category. These finalists present to our pannel of expert judges (in a pitch) who decide the winners in the junior (grade 6-8) and senior (9th and up) categories.",
  ],
};

export const awards = {
  heading: "Awards",
  subheading: "Participate this year and earn your team a place on the glorious pedestal!",
  prizeHeadline: "Over 1 Lakh in prizes available!",
  categories: [
    {
      name: "Junior Category",
      podium: [
        { rank: "2nd Place", amount: "XXXXX INR", tier: "silver" },
        { rank: "1st Place", amount: "XXXXX INR", tier: "gold" },
        { rank: "3rd Place", amount: "XXXXX INR", tier: "bronze" },
      ],
    },
    {
      name: "Senior Category",
      podium: [
        { rank: "2nd Place", amount: "XXXXX INR", tier: "silver" },
        { rank: "1st Place", amount: "XXXXX INR", tier: "gold" },
        { rank: "3rd Place", amount: "XXXXX INR", tier: "bronze" },
      ],
    },
  ],
} as const;

export type ContactField = {
  label: string;
  value: string;
  href?: string;
};

export const homeContactFields: ContactField[] = [
  { label: "Event Details", value: "24 hours - Overnight hackathon" },
  { label: "Event", value: "Oakridge Codefest 2027" },
  { label: "Date", value: site.eventDateLabel },
  { label: "Email", value: site.email, href: `mailto:${site.email}` },
  { label: "Instagram", value: site.instagram.label, href: site.instagram.href },
  { label: "Website", value: site.website.label, href: site.website.href },
  { label: "Phone number (teacher)", value: site.phoneTeacher },
  { label: "Phone number (core team)", value: site.phoneCoreTeam },
];

export const aboutContactFields: ContactField[] = [
  { label: "Event Details", value: "24 hours - Overnight hackathon" },
  { label: "Event", value: "Oakridge Codefest 2027" },
  { label: "Date", value: site.eventDateLabel },
  { label: "Email", value: site.email, href: `mailto:${site.email}` },
  { label: "Instagram", value: site.instagram.label, href: site.instagram.href },
  { label: "Address", value: "Click to view on Google Maps", href: site.mapsHref },
  { label: "Phone number (teacher)", value: site.phoneTeacher },
  { label: "Phone number (core team)", value: site.phoneCoreTeam },
];

export const missionVision = {
  heading: "Mission and Vision",
  mission: {
    title: "Our Mission",
    text: "Our mission is to empower students to collaborate, innovate, and problem-solve under real-world constraints and help them transform hobbies into projects will a real-world impact.",
  },
  vision: {
    title: "Our Vision",
    text: "Our vision is to create a community of builders and leaders who are empowered to develop creative and original solutions to real-world challenges, transforming ideas into impactful realities.",
  },
};

export const whatIsCodefest = {
  heading: "What is Oakridge Codefest?",
  paragraphs: [
    "Oakridge Codefest 2027 is an overnight hackathon that aims to bring together students from all over the world to collaborate, learn, and innovate. The event is organized by the students of Oakridge International School, Bengaluru, and is open to all students aged 13–18.",
    "Whether you are new to coding or a seasoned pro, Oakridge Codefest 2027 is the perfect opportunity to showcase your skills, learn from others, and have fun!",
    "The competition process includes 24 hours to build a project based on the given themes. These projects are then evaluated based on the code, idea, audits and originality to be able to decide finalists from each category. These finalists present to our pannel of expert judges (in a pitch) who decide the winners in the junior (grade 6-8) and senior (9th and up) categories.",
  ],
};

export type Benefit = {
  icon: "graduation-cap" | "lightbulb" | "trophy" | "globe" | "rocket";
  title: string;
  text: string;
};

export const benefits: { heading: string; items: Benefit[] } = {
  heading: "Why Codefest Stands Out!",
  items: [
    {
      icon: "graduation-cap",
      title: "National-Level Hackathon",
      text: "India's largest in-person high-school hackathon, bringing top young coders together.",
    },
    {
      icon: "lightbulb",
      title: "24 Hours of Innovation",
      text: "Collaborate, code and build real-world solutions under time pressure.",
    },
    {
      icon: "trophy",
      title: "Big Rewards, Bigger Recognition",
      text: "Win from a ₹1.5 lakh+ prize pool and earn national recognition.",
    },
    {
      icon: "globe",
      title: "Pan-India Participation",
      text: "Students from schools across India compete, network and grow together.",
    },
    {
      icon: "rocket",
      title: "Create what matters",
      text: "Design Impactful text. From apps and games to Next-generation technologies",
    },
  ],
};

export const faqs: { question: string; answer: string }[] = [
  {
    question: "What is the main flow of the event?",
    answer:
      "Oakridge Codefest is a 24 hour hackathon where participants begin building projects based on their theme. Throughout the event there will be audits challenges, and more. Selected teams then pitch their product to the expert judges and then winners are selected.",
  },
  {
    question: "Where is the event held?",
    answer: "Oakridge International School Bangalore (refer to contact section for address).",
  },
  {
    question: "Who do I contact for any queries?",
    answer:
      "Contact the core team members through either the emails or phone numbers (if urgent) in the contact section.",
  },
  {
    question: "What do I need to bring to the event?",
    answer:
      "A laptop/desktop and ideally a charger or way to charge it is sufficient, although participants can bring additional items such as toiletries, peripherals monitors, or other aspects required to develop the product.",
  },
  {
    question: "May I start building the project beforehand?",
    answer:
      "No. All projects and components including art must be built during the event. For clarification on what can be done before the event, contact the core team.",
  },
  {
    question: "Will meals and food be provided by the school?",
    answer:
      "Yes. Students will recieve 3 meals along with a snack during the event and can purchase additional meals from the oak cafe or using food delivery apps during the designated time spots if they wish to.",
  },
  {
    question: "I do not know how to code, should I still join?",
    answer:
      "Of Course! Codefest is a lot more than just coding, it involves presenting, ideating, designing and working together. Hence even if you do not know how to code you would still have a great time at Oakridge Codefest.",
  },
  {
    question: "Can I participate solo or do I need a team?",
    answer:
      "Participants are required to compete in teams of 2–6 members to reinforce collaboration as a central and essential component of the competition.",
  },
  {
    question: "Are hardware projects allowed?",
    answer:
      "Yes, as long as all components are brought by the participants and the project is built entirely during the event.",
  },
  {
    question: "What themes can we expect?",
    answer:
      "To be revealed soon, stay tuned!",
  },
  {
    question: "Will there be mentors available?",
    answer:
      "Yes. Industry professionals and experienced developers will be available throughout the event for guidance and to conduct/assist in audits.",
  },
  {
    question: "Is this an online or offline event?",
    answer: "Oakridge Codefest 2027 is conducted offline at Oakridge International School, Bengaluru.",
  },
  {
    question: "What happens if I don't finish my project?",
    answer:
      'That’s normal. Judges evaluate progress, intent, and execution, not just a "finished" product.',
  },
  {
    question: "Does a teacher/supervisor need to accompany us to the event?",
    answer:
      "All external teams partaking in the Junior category(Grades 6-8) will need to be accompanied by a supervisor. Note that a supervisor is not required for Senior(Grades 9-12) category.",
  },
  {
    question: "Will certificates be provided?",
    answer:
      "Yes. All participants will receive certificates of participation, and winners will receive special certificates and prizes.",
  },
  {
    question: "Will there be a schedule or timeline for the 24 hours?",
    answer:
      "Yes. A detailed event schedule, including check-ins, audits, meals, mentor sessions, and final pitching, is present on this page.",
  },
];

export type TeamMember = {
  name: string;
  role: string;
  image: string;
};

export type DepartmentKey = "technology" | "logistics" | "finance" | "marketing";

export type Department = {
  key: DepartmentKey;
  title: string;
  description?: string;
  members: TeamMember[];
};

export const ourTeam = {
  heading: "Our Team",
  noteTitle: "The OC",
  noteText:
    "The driving force behind Oakridge Codefest 2027 is the codefest OC (Organizing Committee). The OC has numerous members across multiple fields to ensure the smooth running of the event.",
  coreTeam: {
    title: "Core Team",
    description:
      "The core team is responsible for overseeing all other teams and ensuring inter-team communication and coordination.",
  },
  // Core team
  leadership: [
    { name: "Akshat Shanker Gupta", role: "Core Team", image: "/team/akshat-shanker-gupta.png" },
    { name: "Ritayush Suchismita Dey", role: "Core Team", image: "/team/ritayush-suchismita-dey.png" },
    { name: "Ryan Dennis Gomez", role: "Core Team", image: "/team/ryan-dennis-gomez.png" },
    { name: "Avika Prakash", role: "Core Team", image: "/team/avika-prakash.png" },
  ] satisfies TeamMember[],
  departments: [
    {
      key: "technology",
      title: "Technology",
      description:
        "The technology team is responsible for aspects such as the website, team dashboard, some parts of auditing and mini-challenges, and more, acting to make sure the event remains engaging and smooth.",
      members: [
        { name: "Pratyush Vel Shankar", role: "Head of Technology", image: "/team/pratyush-vel-shankar.png" },
        { name: "Samarth Sharma", role: "Technology Member", image: "/team/samarth-sharma.png" },
        { name: "Divyan Mehta", role: "Technology Member", image: "/team/divyan-mehta.png" },
      ],
    },
    {
      key: "logistics",
      title: "Logistics",
      description:
        "The logistics team is responsible for managing the logistics of the event, such as tables, seating, mini-challenges, and more, ensuring that all aspects of the event run smoothly and efficiently.",
      members: [
        { name: "Aryan Vanam", role: "Head of Logistics", image: "/team/aryan-vanam.png" },
        { name: "Esha Santhosh", role: "Logistics Member", image: "/team/esha-santhosh.png" },
        { name: "Aishwarya Pagadala", role: "Logistics Member", image: "/team/aishwarya-pagadala.png" },
      ],
    },
    {
      key: "finance",
      title: "Finance",
      description:
        "The finance team is responsible for managing the budget and finances of the event, ensuring that all expenses are within the allocated budget and that all financial transactions are transparent and accountable.",
      members: [
        { name: "Ritika Rahul Kalaskar", role: "Head of Finance", image: "/team/ritika-rahul-kalaskar.png" },
        { name: "Daivik CH", role: "Finance Member", image: "/team/daivik-ch.png" },
        { name: "Saanvi Reddy", role: "Finance Member", image: "/team/saanvi-reddy.png" },
      ],
    },
    {
      key: "marketing",
      title: "Marketing",
      description:
        "The marketing team is responsible for promoting the event, managing outreach, creating publicity material, and ensuring that participants and schools stay informed and engaged throughout the Codefest journey.",
      members: [
        { name: "Kritika Yadav", role: "Head of Marketing", image: "/team/kritika-yadav.png" },
        { name: "Kyra Agarwal", role: "Marketing Member", image: "/team/kyra-agarwal.png" },
        { name: "Saptak Deb", role: "Marketing Member", image: "/team/saptak-deb.png" },
      ],
    },
  ] satisfies Department[],
};

// Sponsor placeholder
export const sponsor = {
  heading: "Our Sponsors",
  noteTitle: "Slot Reserved",
  noteText: "Our sponsors are still being finalized. Check back soon!",
};

export const gallery = {
  heading: "A Peek Into Our Past",
  imageCount: 15,
};
