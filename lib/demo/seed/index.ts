import type { DemoDB } from '../types'
import { seedClassFixedEvents, seedCourses, seedSchoolTasks } from './school'
import {
  seedBriefQuestions, seedCalendarEvents, seedDailyLogs, seedDayPlans, seedDayRules,
  seedGoals, seedManualFixedEvents, seedPersonalTasks,
} from './home'
import { seedIdeas, seedJournal, seedNotes } from './journal'
import { seedCrm } from './crm'
import { seedControlRoom } from './controlRoom'

/** Bump when the shape of DemoDB changes, so stale saved copies are discarded. */
export const DB_VERSION = 1

/** Builds a complete, fresh database of sample data for the given local date. */
export function buildSeed(today: string): DemoDB {
  const courses = seedCourses(today)
  const tasks = [...seedPersonalTasks(today), ...seedSchoolTasks(today)]
  const { goals, steps } = seedGoals(today)
  const { entries, reflection } = seedJournal(today)
  const { ideas, insight, captures } = seedIdeas(today)

  return {
    version: DB_VERSION,
    seededOn: today,
    tasks,
    courses,
    dailyLogs: seedDailyLogs(today),
    goals,
    goalSteps: steps,
    calendarEvents: seedCalendarEvents(today),
    fixedEvents: [...seedClassFixedEvents(courses), ...seedManualFixedEvents()],
    dayRules: seedDayRules(),
    dayPlans: seedDayPlans(today, tasks),
    briefQuestions: seedBriefQuestions(today),
    journalEntries: entries,
    journalReflection: reflection,
    ideas,
    ideasInsight: insight,
    ideaCaptures: captures,
    notes: seedNotes(today),
    rawCaptures: [],
    crm: seedCrm(today),
    controlRoom: seedControlRoom(today),
    audit: [],
  }
}
