// Classroom settings. The teacher can edit this file.
'use strict';

const CLASSROOM = {
  // Minimum score (%) of "Check my solution" to pass a challenge and unlock the next one.
  passScore: 80,
  // Remind the student to download their work after this many minutes (only when the class server cannot be reached).
  saveReminderMinutes: 20,
};
CLASSROOM.allowGuided = true;
CLASSROOM.allowFree = true;
// Classes the teacher can assign to each student (Manage tab of the dashboard).
CLASSROOM.classes = ['Tech5ENa', 'Tech5ENb', 'Tech5ENc', 'Tech5ENd', 'Tech5ENe'];
