const db=require('./DataBaseConnection')

// const runQuery = (query, params) => {
//     return new Promise((resolve, reject) => {
//       db.query(query, params, (error, results) => {
//         if (error) {
//           reject({error,params});
//         } else {
//           resolve(results);
//         }
//       });
//     });
//   };
  // Modify runQuery to accept a connection
const runQuery = (query, params, connection = db) => {
  return new Promise((resolve, reject) => {
      connection.query(query, params, (error, results) => {
          if (error) {
              reject(error);
          } else {
              resolve(results);
          }
      });
  });
};
  // Transaction handler
const runTransaction = async (callback) => {
  const connection = await new Promise((resolve, reject) => {
      db.getConnection((err, conn) => {
          if (err) reject(err);
          else resolve(conn);
      });
  });

  try {
      await runQuery("START TRANSACTION", [], connection);

      // Pass the connection to the callback function
      await callback(runQuery.bind(null, connection));

      await runQuery("COMMIT", [], connection);
      connection.release();
      return { success: true };
  } catch (error) {
      await runQuery("ROLLBACK", [], connection);
      connection.release();
      return { success: false, error };
  }
};

module.exports={runQuery,runTransaction};