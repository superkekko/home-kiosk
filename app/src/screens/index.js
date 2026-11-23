import calendar from './calendar.js';
import birthday from './birthday.js';
import photoDashboard from './photo-dashboard.js';
import photo from './photo.js';

// Registro delle schermate disponibili. Per aggiungerne una: nuovo file in
// questa cartella con { id, width, height, grayscale, refreshMinutes, frames(now) }
// e una riga qui sotto.
export const SCREENS = Object.fromEntries(
    [calendar, birthday, photoDashboard, photo].map(screen => [screen.id, screen])
);
