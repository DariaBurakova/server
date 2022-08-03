import fs from 'fs';
import {db} from './db.js';
import date from 'date-and-time';
import { v4 as uuid } from 'uuid'

export const getIndex = (_, res) => {
  fs.readFile("index.html", "utf-8", (error, data) => {
    if (error) {
      const errorMsg = "Ошибка сервера: нет корневого index.html";
      console.error(errorMsg);
      res.send(errorMsg);
    } else {
      res.send(data);
    }
  });
};

export const handleErrors = (err) => {
    if (err) console.error('Ошибка базы данных: ' + err);
};

export const getPerson = (req, response) => {
  db.get(
    `SELECT * FROM persona WHERE route = ?`,
    req.params.route,
    (err, rows) => {
      handleErrors(err);
      response.send(rows);
    }
  );
};

export const getVideos = (req, response) => {
  db.all(
    `SELECT image, route, title, rating, agelimit
    FROM videos
    ORDER BY rating DESC
    LIMIT ?`,
    req.params.arrayLength ? req.params.arrayLength : 12,
    (err, rows) => {
      handleErrors(err);
      response.send(rows);
    }
  );
};

export const getSerials = (_, response) => {
  db.all(
    `SELECT image, route, title, rating, agelimit
    FROM serials
    ORDER BY rating DESC`,
    (err, rows) => {
      handleErrors(err);
      response.send(rows);
    }
  );
};

function getCriterium(req) {
  const order = req.body.order;
  let criterium = order ? order : "rating";
  if (order === "newest") criterium = "add_at";
  return criterium;
}

export const getFilms = (req, response) => {
  const criterium = getCriterium(req);
  let query = '';
  if (!req.body.page) {
    query = `SELECT image, route, title, rating, agelimit FROM films ORDER BY ${ criterium } DESC`;
    if (req.body.arrayLength && req.body.arrayLength > 0) {
      query +=  ` LIMIT ${ req.body.arrayLength };`;
    } else {
      query += ';';
    }
  } else if (!req.body.sort) {
    query = `SELECT image, route, title, rating, agelimit FROM
    (SELECT * FROM
      (SELECT * FROM films
        ORDER BY ${ criterium }
        DESC LIMIT ${ req.body.arrayLength * req.body.page })
    ORDER BY ${ criterium } ASC LIMIT ${ req.body.arrayLength })
    ORDER BY ${ criterium } DESC;`;
  } else {
    query = `SELECT image, route, title, rating, agelimit FROM
    (SELECT * FROM
      (SELECT * FROM films
        WHERE route IN
          (SELECT route FROM film_genre WHERE genre_id = \"${ req.body.sort }\")
        ORDER BY ${ criterium }
        DESC LIMIT ${ req.body.arrayLength * req.body.page })
    ORDER BY ${ criterium } ASC LIMIT ${ req.body.arrayLength })
    ORDER BY ${ criterium } DESC;`;
  }
  db.all(query, (err, rows) => {
      handleErrors(err);
      response.send(rows);
  });
};

export const getVideoContent = (req, response) => {
  const criterium = getCriterium(req);
  const query = `SELECT image, route, title, rating, agelimit, add_at, poster FROM films
  UNION
  SELECT image, route, title, rating, agelimit, add_at, poster FROM videos
  UNION
  SELECT image, route, title, rating, agelimit, add_at, poster FROM serials
  ORDER BY ${ criterium } DESC
  LIMIT ${ req.body.arrayLength ? req.body.arrayLength : 12 } `;
  db.all(query, (err, rows) => {
      handleErrors(err);
      response.send(rows);
    }
  );
};

function textReplacer(text) {
  return text
    .replace(/\.\.\./g, '…')
    .replace(/(^)\x22(\s)/g, '$1»$2')
    .replace(/(^|\s|\()"/g, '$1«')
    .replace(/"(;|!|\?|:|\.|…|,|$|\)|\{|\s)/g, '»$1')
    .replace(/(?<!»,) - /g, ' — ')
    .replace(/(«[^»]*)«([^»]*)»/g, '$1„$2“')
};

export const postComment = (req, response) => {
  const comment = textReplacer(req.body.message);
  const dt = date.format(new Date(), 'DD.MM.YYYY HH:mm');
  const query = `INSERT INTO comments (film_route, username, message, datetime) VALUES (\'${ req.body.route }\', \'${ req.body.username }\', \'${ comment }\', \'${ dt }\');`;
  db.all( query,
    (err) => {
      handleErrors(err);
      response.send({"recieved": "ok"});
    }
  );
};

export const getComments = (req, response) => {
  db.all(
    `SELECT * FROM comments WHERE film_route = ?`, req.params.route,
    (err, rows) => {
      handleErrors(err);
      response.send(rows);
    }
  );
};

export const getImage = (req, response) => {
    const filePath = './img/' + req.params.file;
    fs.access(filePath, fs.constants.R_OK, (err) => {
      if (err) {
        response.statusCode = 404;
        response.end('File not found');
      } else {
        fs.createReadStream(filePath).pipe(response);
      }
    })
};

export const getVideoFile = (req, response) => {
  const filePath = './video/' + req.params.file;
  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      response.statusCode = 404;
      response.end('File not found');
    } else {
      fs.createReadStream(filePath).pipe(response);
    }
  })
};

export const getInfo = (req, response) => {
  const route = req.params.route;
  const filmQuery =  `SELECT * FROM films WHERE route = \"${ route }\"`;
  db.get(filmQuery, (err, rows) => {
      handleErrors(err);
      if (rows) {
        response.send({...rows, type: "film" });
      } else {
        const serialQuery =  `SELECT * FROM serials WHERE route = \"${ route }\"`;
        db.get(serialQuery, (err, rows) => {
          handleErrors(err);
          if (rows) {
            response.send({...rows, type: "serial"});
          } else {
            const videoQuery =  `SELECT * FROM videos WHERE route = \"${ route }\"`;
            db.get(videoQuery, (err, rows) => {
              handleErrors(err);
              if (rows) {
                response.send({...rows, type: "video" });
              } else {
                response.send(undefined);
              }
            });
          }
        });
      }
  });
};

export const getGenres = (req, response) => {
  const type = req.body.contentType;
  let table = 'films'
  if (type === 'serial') table = 'serials';
  if (type === 'video') table = 'videos';
  db.all(`SELECT * FROM genres WHERE id IN
  (SELECT DISTINCT genre_id FROM film_genre WHERE route IN
  (SELECT route FROM ${table})
  ORDER BY genre_id ASC)
  UNION
  SELECT * FROM genres WHERE id = 0`, (err, rows) => {
    handleErrors(err);
    response.send(rows);
  });
};

export const getFilmGenres = (req, response) => {
  db.all(`SELECT genre FROM genres WHERE id IN
    (SELECT genre_id FROM film_genre
    WHERE route = \"${ req.params.route }\")`, (err, rows) => {
    handleErrors(err);
    if (rows) {
      const array = []
      rows.forEach(row => array.push(row.genre))
      response.send(array);
    } else {
      response.send(rows);
    }
  });
};

export const getNumOfFilms = (req, response) => {
  const genre_id = req.params.genre_id;
  if (!genre_id || genre_id === 0) {
    db.get(`SELECT COUNT(*) AS count FROM films;`, (err, rows) => {
      handleErrors(err);
      response.send(rows);
    });
  } else {
    db.get(`SELECT COUNT(*) AS count FROM films WHERE route IN
    (SELECT route FROM film_genre WHERE genre_id = \"${ genre_id }\");`, (err, rows) => {
      handleErrors(err);
      response.send(rows);
    });
  }
};

export const getDirectors = (req, response) => {
  db.all(`SELECT name, route FROM persona WHERE route IN
  (SELECT person_route FROM film_director WHERE film_route = \"${ req.params.route }\")`, (err, rows) => {
    handleErrors(err);
    response.send(rows);
  });
};

export const getActors = (req, response) => {
  db.all(`SELECT name, route FROM persona WHERE route IN
  (SELECT person_route FROM film_actor WHERE film_route = \"${ req.params.route }\")`, (err, rows) => {
    handleErrors(err);
    response.send(rows);
  });
};

export const getNews = (_, response) => {
  db.all(
    `SELECT route, image, title, description, created_date
    FROM news `,
    (err, rows) => {
      handleErrors(err);
      response.send(rows);
    }
  );
};

export const goSearch = (req, response) => {
  const sstr = req.body.searchString;
  db.all(`SELECT * FROM films WHERE title LIKE '%${sstr}%'`, (err, rows) => {
    handleErrors(err);
    response.send(rows);
  });
};

export const getUsername = (req, response) => {
  db.get(`SELECT login FROM users WHERE auth = \"${ req.params.uid }\"`, (err, rows) => {
    handleErrors(err);
    response.send(rows);
  })
};

export const signinUser = (req, response) => {
  const auth = uuid()
  db.exec(`INSERT INTO users (login, email, password, auth)
  VALUES ('${ req.body.login }', '${ req.body.email }', '${ req.body.pswd }', '${ auth }')`,
  err => {
    if (err) {
      handleErrors(err);
      response.send({ error: err });
    } else {
      response.send({ auth: auth });
    }
  });
};

export const loginUser = (req, response) => {
  db.get(`SELECT password FROM users WHERE email = '${ req.body.email }'`, (err, row) => {
    handleErrors(err);
    const ps = row ? row.password.substr(64) : ''
    const recieved_ps = req.body.pswd ? req.body.pswd.substr(64) : undefined
    if (recieved_ps === ps) {
      const auth = uuid()
      db.exec(`UPDATE users SET auth = '${ auth }' WHERE email = '${ req.body.email }'`,
      err => {
        if (err) {
          handleErrors(err);
          response.send({ error: err });
        } else {
          response.send({ auth: auth });
        }
      });
    } else {
      response.send({ error: 'Неверный адрес электронной почты или пароль' });
    }
  })
};

export const logoutUser = (req, response) => {
  db.exec(`UPDATE users SET auth = NULL WHERE login = '${ req.params.name }'`,
  err => {
    if (err) {
      handleErrors(err);
      response.send({ error: err });
    } else {
      response.send({ logout: true });
    }
  });
};

export const getAllUsers = (_, response) => {
  db.all('SELECT * FROM users', (err, rows) => {
    handleErrors(err);
    response.send(rows);
  })
}

export const getInfoMedia = (req, response) => {
  const route = req.params.route;
  const news =  `SELECT * FROM news WHERE route = \"${ route }\"`;
  db.get(news, (err, rows) => {
      handleErrors(err);
      if (rows) {
        response.send(rows);
      }else {
        const articles = `SELECT * FROM articles WHERE route = \"${ route }\"`
        db.get(articles, (err,rows) => {
          handleErrors(err);
      if (rows) {
        response.send(rows);
      }else {
        response.send(undefined);
      }
        });
      }
   });
};

export const getArticles = (_,response) => {
  db.all(
    `SELECT route, image, title, description, created_date
  FROM articles `,
  (err, rows) => {
    handleErrors(err);
    response.send(rows);
  }
  );
};

export const getSeasonsNumber = (req,response) => {
  db.get(
    `SELECT max(season) as count FROM episodes WHERE serial_route = '${ req.params.route }'`,
    (err, num) => {
      handleErrors(err);
      response.send(num);
    }
  );
};

export const getEpisodes = (req,response) => {
  db.all(
    `SELECT * FROM episodes
    WHERE serial_route = '${ req.body.route }' AND season = '${ req.body.season }'`,
    (err, rows) => {
      handleErrors(err);
      response.send(rows);
    }
  );
};



