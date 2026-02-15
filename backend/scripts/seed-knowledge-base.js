#!/usr/bin/env node

/**
 * Seed Pinecone vector database with fact-checking knowledge base
 */

import dotenv from 'dotenv';

// CRITICAL: Load environment variables BEFORE importing other modules
dotenv.config();

import { generateEmbeddingsBatch } from '../services/embeddings.js';
import { initializePinecone, upsertVectors, getIndexStats } from '../services/vectordb.js';
import { prepareDocument, prepareDocumentSync } from '../utils/chunking.js';

// Comprehensive fact-checking knowledge base for real-time news claim verification
// Categories: history, science, health, technology, geography, economics, politics, culture
const knowledgeBase = [
  // ===== HISTORICAL FACTS =====
  {
    id: 'fact-001',
    claim: 'The Eiffel Tower was completed in 1889',
    verdict: 'TRUE',
    explanation: 'The Eiffel Tower was built from 1887 to 1889 as the entrance arch for the 1889 World\'s Fair in Paris. It was officially opened on March 31, 1889.',
    source: 'https://en.wikipedia.org/wiki/Eiffel_Tower',
    category: 'history',
    credibility: 'high'
  },
  {
    id: 'fact-004',
    claim: 'Napoleon Bonaparte was extremely short for his time',
    verdict: 'FALSE',
    explanation: 'Napoleon was recorded as 5 feet 2 inches, but this was in French feet. When converted to modern measurements, he was about 5 feet 7 inches (1.70m), which was actually slightly above average for French men in the early 1800s. The myth arose from confusion between French and English measurement systems and British propaganda.',
    source: 'https://en.wikipedia.org/wiki/Napoleon#Height',
    category: 'history',
    credibility: 'high'
  },
  {
    id: 'fact-008',
    claim: 'Albert Einstein failed mathematics in school',
    verdict: 'FALSE',
    explanation: 'Einstein excelled at mathematics from a young age and was performing calculus by age 12. The myth may have originated from a change in the Swiss grading system that made old transcripts appear as failures, or from his failure of the Zurich Polytechnic entrance exam (he did poorly in subjects other than math and physics). Einstein himself addressed this myth.',
    source: 'https://en.wikipedia.org/wiki/Albert_Einstein#Education',
    category: 'history',
    credibility: 'high'
  },
  {
    id: 'fact-011',
    claim: 'Vikings wore horned helmets',
    verdict: 'FALSE',
    explanation: 'There is no historical evidence that Vikings wore horned helmets. This myth was popularized by 19th-century Romantic nationalism and theatrical productions, particularly Wagner\'s operas. Archaeological evidence shows Viking helmets were simple, practical designs without horns.',
    source: 'https://en.wikipedia.org/wiki/Horned_helmet',
    category: 'history',
    credibility: 'high'
  },
  {
    id: 'fact-012',
    claim: 'Christopher Columbus discovered that the Earth is round',
    verdict: 'FALSE',
    explanation: 'The spherical Earth was already well-established knowledge among educated Europeans in Columbus\'s time. Ancient Greek mathematicians, including Eratosthenes who calculated Earth\'s circumference around 240 BCE, had proven Earth was round. Columbus\'s voyage was about finding a western route to Asia, not proving Earth\'s shape.',
    source: 'https://en.wikipedia.org/wiki/Myth_of_the_flat_Earth',
    category: 'history',
    credibility: 'high'
  },
  
  // ===== SCIENCE FACTS =====
  {
    id: 'fact-002',
    claim: 'Water boils at 100 degrees Celsius at sea level',
    verdict: 'TRUE',
    explanation: 'At standard atmospheric pressure (1 atmosphere or 101.325 kPa), which occurs at sea level, water boils at exactly 100 degrees Celsius (212 degrees Fahrenheit).',
    source: 'https://en.wikipedia.org/wiki/Boiling_point',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-003',
    claim: 'The Great Wall of China is visible from space with the naked eye',
    verdict: 'FALSE',
    explanation: 'This is a common myth. The Great Wall of China is not visible from space with the naked eye. NASA astronauts have confirmed that it is barely visible from low Earth orbit, and certainly not visible from the Moon. The wall is too narrow and blends with the natural landscape.',
    source: 'https://www.nasa.gov/vision/space/workinginspace/great_wall.html',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-005',
    claim: 'Lightning never strikes the same place twice',
    verdict: 'FALSE',
    explanation: 'This is a complete myth. Lightning frequently strikes the same location multiple times, especially tall or prominent structures. The Empire State Building is struck by lightning about 100 times per year. Lightning follows the path of least resistance, so if a location made a good target once, it will likely be struck again.',
    source: 'https://www.weather.gov/safety/lightning-myths',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-006',
    claim: 'Bulls are angered by the color red',
    verdict: 'PARTIALLY_TRUE',
    explanation: 'Bulls are actually colorblind to red. What provokes the bull in a bullfight is the movement of the cape, not its color. However, red capes are used traditionally for visibility to the audience and to hide bloodstains. Bulls react to motion and the threatening behavior of the matador, not the color.',
    source: 'https://www.discovery.com/science/bulls-dont-get-angry-red',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-007',
    claim: 'We only use 10% of our brains',
    verdict: 'FALSE',
    explanation: 'This is a persistent myth. Brain imaging studies show that we use virtually every part of the brain, and most of the brain is active almost all the time. While it\'s true that only a small percentage of neurons fire at any given moment, over the course of a day, we use 100% of our brain.',
    source: 'https://www.scientificamerican.com/article/do-people-only-use-10-percent-of-their-brains/',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-009',
    claim: 'Goldfish have a three-second memory',
    verdict: 'FALSE',
    explanation: 'Scientific studies have shown that goldfish have memories lasting at least three months and can be trained to recognize shapes, colors, and sounds. They can remember feeding schedules and navigate mazes. The three-second myth has no scientific basis.',
    source: 'https://www.sciencedirect.com/science/article/abs/pii/S016815910300056X',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-010',
    claim: 'The Earth is flat',
    verdict: 'FALSE',
    explanation: 'The Earth is an oblate spheroid (slightly flattened sphere). This has been proven through countless observations including satellite imagery, circumnavigation, the way ships disappear over the horizon, different star constellations in different hemispheres, and direct photographs from space. The spherical Earth has been accepted scientific fact for over 2000 years.',
    source: 'https://en.wikipedia.org/wiki/Spherical_Earth',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-013',
    claim: 'Vaccines cause autism',
    verdict: 'FALSE',
    explanation: 'Multiple comprehensive studies involving millions of children have found no link between vaccines and autism. The original 1998 study by Andrew Wakefield that claimed this link was fraudulent, has been retracted, and Wakefield lost his medical license. The scientific consensus is clear: vaccines do not cause autism.',
    source: 'https://www.cdc.gov/vaccinesafety/concerns/autism.html',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-014',
    claim: 'Humans evolved from chimpanzees',
    verdict: 'PARTIALLY_TRUE',
    explanation: 'This is commonly misunderstood. Humans did not evolve FROM chimpanzees. Rather, humans and chimpanzees share a common ancestor that lived approximately 6-7 million years ago. Both species evolved separately from this ancestor. We are evolutionary cousins, not descendants of modern chimps.',
    source: 'https://en.wikipedia.org/wiki/Human_evolution',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-015',
    claim: 'Cracking your knuckles causes arthritis',
    verdict: 'FALSE',
    explanation: 'Multiple medical studies have found no link between knuckle cracking and arthritis. The popping sound comes from gas bubbles in the synovial fluid between joints, not from bone damage. A 2011 study and decades of research show that habitual knuckle cracking does not increase arthritis risk.',
    source: 'https://www.health.harvard.edu/pain/does-knuckle-cracking-cause-arthritis',
    category: 'science',
    credibility: 'high'
  },
  
  // ===== HEALTH & MEDICAL FACTS =====
  {
    id: 'fact-016',
    claim: 'You need to drink 8 glasses of water per day',
    verdict: 'PARTIALLY_TRUE',
    explanation: 'The "8 glasses a day" rule is oversimplified. Hydration needs vary by person, activity level, climate, and health status. Most people get adequate hydration from food and beverages including coffee and tea. The Institute of Medicine suggests about 3.7 liters for men and 2.7 liters for women from all sources, not just water.',
    source: 'https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/water/art-20044256',
    category: 'health',
    credibility: 'high'
  },
  {
    id: 'fact-017',
    claim: 'Sugar makes children hyperactive',
    verdict: 'FALSE',
    explanation: 'Controlled scientific studies have consistently found no link between sugar consumption and hyperactivity in children. The belief persists due to confirmation bias and the contexts in which children typically consume sugar (parties, celebrations). The myth has been debunked by multiple double-blind studies.',
    source: 'https://www.yalescientific.org/2010/09/mythbusters-does-sugar-really-make-children-hyper/',
    category: 'health',
    credibility: 'high'
  },
  {
    id: 'fact-018',
    claim: 'You lose most of your body heat through your head',
    verdict: 'FALSE',
    explanation: 'You lose body heat through any exposed skin proportional to the surface area exposed. Your head represents about 10% of your body surface, so you lose about 10% of heat through it. The myth originated from a flawed 1950s military study. Wearing a hat helps in cold weather, but not more than covering any other body part of similar size.',
    source: 'https://www.bmj.com/content/337/bmj.a2769',
    category: 'health',
    credibility: 'high'
  },
  {
    id: 'fact-019',
    claim: 'Reading in dim light damages your eyes',
    verdict: 'FALSE',
    explanation: 'Reading in low light may cause eye strain and temporary discomfort, but it does not cause permanent damage to your eyes. The American Academy of Ophthalmology confirms that while it may be uncomfortable, it will not harm your vision. Eye strain symptoms disappear with rest.',
    source: 'https://www.aao.org/eye-health/tips-prevention/myths-about-eyes',
    category: 'health',
    credibility: 'high'
  },
  {
    id: 'fact-020',
    claim: 'Antibiotics are effective against viral infections like the common cold',
    verdict: 'FALSE',
    explanation: 'Antibiotics only work against bacterial infections, not viral infections. The common cold, flu, and COVID-19 are caused by viruses. Taking antibiotics for viral infections is ineffective and contributes to antibiotic resistance, a major global health threat. Doctors should only prescribe antibiotics for confirmed bacterial infections.',
    source: 'https://www.cdc.gov/antibiotic-use/antibiotics-arent-always-answer.html',
    category: 'health',
    credibility: 'high'
  },
  
  // ===== TECHNOLOGY & AI FACTS =====
  {
    id: 'fact-021',
    claim: 'AI systems like ChatGPT have access to the internet in real-time',
    verdict: 'PARTIALLY_TRUE',
    explanation: 'This depends on the specific system and configuration. Base models like GPT-4 were trained on data up to a cutoff date and do not inherently access the internet. However, systems like ChatGPT with browsing enabled or Bing AI can access current web information. It\'s important to check the specific implementation and capabilities of each AI system.',
    source: 'https://help.openai.com/en/articles/8077698-how-do-i-use-chatgpt-browse-with-bing-to-search-the-web',
    category: 'technology',
    credibility: 'high'
  },
  {
    id: 'fact-022',
    claim: 'Private browsing mode makes you completely anonymous online',
    verdict: 'FALSE',
    explanation: 'Private or incognito mode only prevents your browser from saving your browsing history, cookies, and site data locally. Your internet service provider, employer, websites you visit, and network administrators can still track your activity. For true anonymity, you need tools like VPNs or Tor, and even those have limitations.',
    source: 'https://support.google.com/chrome/answer/95464',
    category: 'technology',
    credibility: 'high'
  },
  {
    id: 'fact-023',
    claim: 'Macs cannot get viruses or malware',
    verdict: 'FALSE',
    explanation: 'While macOS has built-in security features and historically faced fewer threats than Windows, Macs are not immune to viruses and malware. As Mac usage has grown, so has malware targeting macOS. Notable Mac malware includes Silver Sparrow, Shlayer, and various adware programs. Mac users should still practice good security habits.',
    source: 'https://www.malwarebytes.com/mac',
    category: 'technology',
    credibility: 'high'
  },
  {
    id: 'fact-024',
    claim: 'Blockchain technology is only used for cryptocurrency',
    verdict: 'FALSE',
    explanation: 'While blockchain is the foundation of cryptocurrencies, it has many other applications including supply chain management, medical records, voting systems, digital identity verification, smart contracts, and intellectual property protection. Many industries are exploring blockchain for its transparency and security benefits beyond finance.',
    source: 'https://www.ibm.com/blockchain/what-is-blockchain',
    category: 'technology',
    credibility: 'high'
  },
  {
    id: 'fact-025',
    claim: '5G networks cause COVID-19 or other health problems',
    verdict: 'FALSE',
    explanation: 'This is a completely debunked conspiracy theory. 5G uses non-ionizing radio waves, similar to 4G, which cannot damage DNA or cause disease. The World Health Organization, FDA, and scientific consensus confirm 5G is safe. COVID-19 is caused by the SARS-CoV-2 virus, which spread to countries without 5G networks.',
    source: 'https://www.who.int/news-room/q-a-detail/5g-mobile-networks-and-health',
    category: 'technology',
    credibility: 'high'
  },
  
  // ===== GEOGRAPHY & DEMOGRAPHICS =====
  {
    id: 'fact-026',
    claim: 'The Great Wall of China is the only man-made structure visible from the Moon',
    verdict: 'FALSE',
    explanation: 'No man-made structures are visible from the Moon with the naked eye. At that distance (384,400 km), Earth appears as a small sphere. Even the Great Wall is barely visible from low Earth orbit, and city lights would be more visible than any single structure. This is a persistent myth with no basis in fact.',
    source: 'https://www.nasa.gov/vision/space/workinginspace/great_wall.html',
    category: 'geography',
    credibility: 'high'
  },
  {
    id: 'fact-027',
    claim: 'Africa is a country',
    verdict: 'FALSE',
    explanation: 'Africa is a continent containing 54 recognized sovereign countries, with diverse cultures, languages, and governments. It is the second-largest continent by both area and population. The misconception that Africa is a single country reflects a problematic oversimplification of the continent\'s vast diversity.',
    source: 'https://en.wikipedia.org/wiki/Africa',
    category: 'geography',
    credibility: 'high'
  },
  {
    id: 'fact-028',
    claim: 'Mount Everest is the tallest mountain on Earth',
    verdict: 'PARTIALLY_TRUE',
    explanation: 'Mount Everest has the highest elevation above sea level at 8,849 meters. However, Mauna Kea in Hawaii is taller when measured from its base on the ocean floor to summit (10,210 meters). Chimborazo in Ecuador is farthest from Earth\'s center due to equatorial bulge. "Tallest" depends on your measurement criteria.',
    source: 'https://en.wikipedia.org/wiki/Mauna_Kea',
    category: 'geography',
    credibility: 'high'
  },
  {
    id: 'fact-029',
    claim: 'Australia is wider than the Moon',
    verdict: 'TRUE',
    explanation: 'Australia\'s diameter from east to west is approximately 4,000 km, while the Moon\'s diameter is 3,474 km. This means Australia is indeed wider than the Moon. However, the Moon is much larger in total volume and surface area due to its spherical shape.',
    source: 'https://www.ga.gov.au/scientific-topics/national-location-information/dimensions',
    category: 'geography',
    credibility: 'high'
  },
  
  // ===== ECONOMICS & BUSINESS =====
  {
    id: 'fact-030',
    claim: 'The gender pay gap is a myth',
    verdict: 'FALSE',
    explanation: 'The gender pay gap is well-documented. In the US, women earn approximately 82 cents for every dollar men earn (2023 data). While some of the gap is explained by occupation and hours worked, studies consistently show an unexplained gap even when controlling for education, experience, and job type. The gap is larger for women of color.',
    source: 'https://www.pewresearch.org/social-trends/fact-sheet/the-narrowing-but-persistent-gender-gap-in-pay/',
    category: 'economics',
    credibility: 'high'
  },
  {
    id: 'fact-031',
    claim: 'Trickle-down economics always benefits the overall economy',
    verdict: 'PARTIALLY_TRUE',
    explanation: 'The effectiveness of trickle-down economics (supply-side economics) is heavily debated among economists. Some studies show benefits in specific contexts, while others, including a 2020 study covering 50 years in 18 countries, found tax cuts for the wealthy do not significantly boost economic growth but do increase income inequality. Economic outcomes depend on many factors.',
    source: 'https://eprints.lse.ac.uk/107919/',
    category: 'economics',
    credibility: 'high'
  },
  
  // ===== FOOD & NUTRITION =====
  {
    id: 'fact-032',
    claim: 'Eating carrots significantly improves your eyesight',
    verdict: 'PARTIALLY_TRUE',
    explanation: 'Carrots contain vitamin A (beta-carotene), which is essential for eye health and can prevent vitamin A deficiency-related vision problems. However, eating carrots will not improve already-normal vision or correct refractive errors. The myth was amplified by British WWII propaganda to hide the existence of radar technology.',
    source: 'https://www.smithsonianmag.com/arts-culture/a-wwii-propaganda-campaign-popularized-the-myth-that-carrots-help-you-see-in-the-dark-28812484/',
    category: 'health',
    credibility: 'high'
  },
  {
    id: 'fact-033',
    claim: 'MSG (monosodium glutamate) is dangerous and causes "Chinese Restaurant Syndrome"',
    verdict: 'FALSE',
    explanation: 'Scientific studies have not found evidence that MSG in typical amounts causes adverse reactions in the general population. The FDA, WHO, and numerous studies confirm MSG is safe. "Chinese Restaurant Syndrome" originated from a 1968 letter based on anecdotal evidence and has been largely debunked. MSG is simply a sodium salt of glutamic acid, a naturally occurring amino acid.',
    source: 'https://www.fda.gov/food/food-additives-petitions/questions-and-answers-monosodium-glutamate-msg',
    category: 'health',
    credibility: 'high'
  },
  {
    id: 'fact-034',
    claim: 'Organic food is always more nutritious than conventional food',
    verdict: 'PARTIALLY_TRUE',
    explanation: 'Studies show mixed results. Some research indicates organic produce may have slightly higher levels of certain nutrients and antioxidants, but differences are generally small. A Stanford study found little significant difference in nutritional content. Organic farming does reduce pesticide exposure and may have environmental benefits, but nutritional superiority is not definitively established.',
    source: 'https://www.health.harvard.edu/staying-healthy/should-you-go-organic',
    category: 'health',
    credibility: 'high'
  },
  
  // ===== CLIMATE & ENVIRONMENT =====
  {
    id: 'fact-035',
    claim: 'Climate change is a natural cycle and not significantly influenced by human activity',
    verdict: 'FALSE',
    explanation: 'The scientific consensus (97%+ of climate scientists) is that current climate change is primarily caused by human activities, particularly greenhouse gas emissions. While Earth has natural climate cycles, the current rate of warming is unprecedented in the geological record and correlates directly with industrialization and fossil fuel use since the 1800s.',
    source: 'https://climate.nasa.gov/scientific-consensus/',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-036',
    claim: 'Renewable energy cannot replace fossil fuels',
    verdict: 'FALSE',
    explanation: 'Multiple studies and real-world examples show that renewable energy can meet global energy needs. Countries like Iceland (100% renewable electricity), Norway (98%), and Costa Rica (99%) demonstrate this is achievable. The IPCC and numerous energy studies confirm that 100% renewable energy systems are technically and economically feasible, though the transition requires significant investment and infrastructure changes.',
    source: 'https://www.ipcc.ch/report/ar6/wg3/',
    category: 'science',
    credibility: 'high'
  },
  
  // ===== SPACE & ASTRONOMY =====
  {
    id: 'fact-037',
    claim: 'The Sun is yellow',
    verdict: 'FALSE',
    explanation: 'The Sun is actually white. It appears yellow from Earth because our atmosphere scatters blue light, making the Sun look more yellow. In space or from above the atmosphere, the Sun appears white. It emits light at all visible wavelengths roughly equally, which combines to produce white light.',
    source: 'https://www.nasa.gov/mission_pages/sunearth/science/wavelength-color.html',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-038',
    claim: 'There is no gravity in space',
    verdict: 'FALSE',
    explanation: 'Gravity exists everywhere in space. Astronauts on the International Space Station experience about 90% of Earth\'s gravity. They appear weightless because they are in continuous free-fall around Earth (orbit). Gravity is what keeps the ISS, satellites, the Moon, and planets in orbit. Even in distant space, gravity from stars and galaxies affects everything.',
    source: 'https://www.nasa.gov/audience/forstudents/5-8/features/nasa-knows/what-is-microgravity-58.html',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-039',
    claim: 'The Moon landing was faked',
    verdict: 'FALSE',
    explanation: 'The Apollo Moon landings (1969-1972) are among the most well-documented events in history. Evidence includes: 382 kg of Moon rocks studied worldwide, laser reflectors left on the Moon still used for experiments, independent tracking by multiple countries, thousands of photographs and videos, testimony of 400,000+ workers, and verification by adversarial nations like the Soviet Union. All conspiracy claims have been thoroughly debunked.',
    source: 'https://www.nasa.gov/mission_pages/apollo/missions/index.html',
    category: 'history',
    credibility: 'high'
  },
  
  // ===== ANIMALS & NATURE =====
  {
    id: 'fact-040',
    claim: 'Ostriches bury their heads in the sand when scared',
    verdict: 'FALSE',
    explanation: 'Ostriches do not bury their heads in sand. When threatened, they either run away (they can run up to 70 km/h) or lie flat on the ground with their necks outstretched, making them less visible from a distance. They may also dig holes in sand for nests and stick their heads in to turn eggs, which might have started this myth.',
    source: 'https://www.sandiegozoo.org/animals/ostrich',
    category: 'science',
    credibility: 'high'
  },
  
  // ===== ADDITIONAL COMMON FACTS FOR DEMO =====
  {
    id: 'fact-041',
    claim: 'Mount Everest is the tallest mountain in the world',
    verdict: 'TRUE',
    explanation: 'Mount Everest is Earth\'s highest mountain above sea level at 8,848.86 meters (29,031.7 feet). Located in the Mahalangur Himal sub-range of the Himalayas, it straddles the border between Nepal and China (Tibet). While Mauna Kea in Hawaii is taller when measured from its base on the ocean floor, Everest has the highest elevation above sea level.',
    source: 'https://en.wikipedia.org/wiki/Mount_Everest',
    category: 'geography',
    credibility: 'high'
  },
  {
    id: 'fact-042',
    claim: 'The human body has 206 bones',
    verdict: 'TRUE',
    explanation: 'The adult human skeleton consists of 206 bones. Babies are born with approximately 270 bones, but many fuse together during growth and development. The 206 bones include 80 in the axial skeleton (skull, spine, ribs, sternum) and 126 in the appendicular skeleton (limbs, pelvis, shoulder girdle). The exact number can vary slightly due to individual anatomical differences.',
    source: 'https://en.wikipedia.org/wiki/Human_skeleton',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-043',
    claim: 'The moon is made of cheese',
    verdict: 'FALSE',
    explanation: 'The Moon is not made of cheese - this is a folklore myth. The Moon is a rocky body composed primarily of silicate minerals and rocks similar to Earth\'s crust and mantle. Its composition has been studied through lunar samples brought back by Apollo missions, showing it contains minerals like feldspar, pyroxene, and olivine. The "moon is made of cheese" is an old joke that predates space exploration.',
    source: 'https://www.nasa.gov/moon',
    category: 'science',
    credibility: 'high'
  },
  {
    id: 'fact-044',
    claim: 'Apple is a trillion-dollar company',
    verdict: 'TRUE',
    explanation: 'Apple Inc. became the first publicly traded U.S. company to reach a $1 trillion market capitalization on August 2, 2018. As of 2024, Apple\'s market cap has exceeded $3 trillion at various points, making it one of the most valuable companies in the world. The company designs and manufactures consumer electronics, software, and online services including iPhone, Mac, iPad, and more.',
    source: 'https://en.wikipedia.org/wiki/Apple_Inc.',
    category: 'technology',
    credibility: 'high'
  },
  {
    id: 'fact-045',
    claim: 'Microsoft is a trillion-dollar company',
    verdict: 'TRUE',
    explanation: 'Microsoft Corporation reached a $1 trillion market capitalization in April 2019, becoming the third U.S. public company to do so after Apple and Amazon. As of 2024, Microsoft\'s market cap frequently exceeds $3 trillion, ranking among the world\'s most valuable companies. Microsoft develops computer software, consumer electronics, personal computers, and related services.',
    source: 'https://en.wikipedia.org/wiki/Microsoft',
    category: 'technology',
    credibility: 'high'
  },
  {
    id: 'fact-046',
    claim: 'Google (Alphabet Inc.) is a trillion-dollar company',
    verdict: 'TRUE',
    explanation: 'Alphabet Inc., Google\'s parent company, surpassed a $1 trillion market capitalization in January 2020, becoming the fourth U.S. company to achieve this milestone. As of 2024, Alphabet\'s market cap remains above $1 trillion. Google/Alphabet is a multinational technology company specializing in internet-related services and products including search, advertising, cloud computing, and AI.',
    source: 'https://en.wikipedia.org/wiki/Alphabet_Inc.',
    category: 'technology',
    credibility: 'high'
  },
  {
    id: 'fact-047',
    claim: 'OpenAI released GPT-4 in 2023',
    verdict: 'TRUE',
    explanation: 'OpenAI released GPT-4, the fourth generation of its Generative Pre-trained Transformer large language model, on March 14, 2023. GPT-4 is a multimodal model capable of processing both text and image inputs. It demonstrated significant improvements over GPT-3.5 in areas like reasoning, creativity, and handling complex instructions. The release was highly anticipated in the AI community.',
    source: 'https://openai.com/research/gpt-4',
    category: 'technology',
    credibility: 'high'
  },
  {
    id: 'fact-048',
    claim: 'Donald Trump won the 2024 US presidential election',
    verdict: 'TRUE',
    explanation: 'Donald Trump won the 2024 United States presidential election, defeating Democratic nominee Kamala Harris. Trump secured 312 electoral votes to Harris\'s 226. This made Trump the 45th and 47th President of the United States, only the second person in U.S. history to serve non-consecutive terms (after Grover Cleveland). The election took place on November 5, 2024.',
    source: 'https://en.wikipedia.org/wiki/2024_United_States_presidential_election',
    category: 'politics',
    credibility: 'high'
  }
];

/**
 * Seed the vector database with LangChain integration
 */
async function seedDatabase() {
  console.log('🌱 Starting knowledge base seeding...\n');
  
  try {
    // Initialize Pinecone
    console.log('📊 Initializing Pinecone...');
    await initializePinecone();
    
    console.log(`\n📚 Processing ${knowledgeBase.length} verified facts across multiple categories...\n`);
    
    // Prepare all documents for embedding
    const allVectors = [];
    
    for (const fact of knowledgeBase) {
      console.log(`Processing: "${fact.claim.substring(0, 60)}..."`);
      
      // Create searchable text combining claim and explanation
      const searchableText = `Claim: ${fact.claim}\n\nExplanation: ${fact.explanation}`;
      
      // Chunk the document using LangChain (async version)
      // Use sync version for now to maintain compatibility
      const chunks = prepareDocumentSync(searchableText, {
        factId: fact.id,
        claim: fact.claim,
        verdict: fact.verdict,
        category: fact.category,
        credibility: fact.credibility,
        source: fact.source
      });
      
      // Generate embeddings for chunks
      const texts = chunks.map(c => c.text);
      const embeddings = await generateEmbeddingsBatch(texts);
      
      // Prepare vectors for Pinecone
      chunks.forEach((chunk, index) => {
        allVectors.push({
          id: `${fact.id}-chunk-${index}`,
          values: embeddings[index],
          metadata: {
            text: chunk.text,
            claim: fact.claim,
            verdict: fact.verdict,
            explanation: fact.explanation,
            category: fact.category,
            credibility: fact.credibility,
            source: fact.source,
            chunkIndex: chunk.metadata.chunkIndex,
            totalChunks: chunk.metadata.totalChunks
          }
        });
      });
      
      console.log(`  ✓ Generated ${chunks.length} chunk(s)`);
    }
    
    // Upsert to Pinecone in batches
    console.log(`\n📤 Upserting ${allVectors.length} vectors to Pinecone (namespace: knowledge-base)...`);
    const batchSize = 100;
    
    for (let i = 0; i < allVectors.length; i += batchSize) {
      const batch = allVectors.slice(i, i + batchSize);
      console.log(`  📊 Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} vectors`);
      if (batch.length > 0) {
        await upsertVectors(batch, 'knowledge-base'); // Use 'knowledge-base' namespace
        console.log(`  ✓ Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allVectors.length / batchSize)}`);
      }
    }
    
    // CRITICAL: Wait for Pinecone eventual consistency (10+ seconds required)
    console.log('\n⏰ Waiting 10 seconds for Pinecone index to sync...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Get and display stats
    console.log('\n📊 Index Statistics:');
    const stats = await getIndexStats();
    if (stats) {
      console.log(`  Total vectors: ${stats.totalRecordCount || 0}`);
      console.log(`  Dimension: ${stats.dimension || 3072}`);
    }
    
    console.log('\n✅ Knowledge base seeding completed!');
    console.log('\n💡 The vector database is now ready for semantic search with LangChain.');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase();
}

export { seedDatabase, knowledgeBase };
