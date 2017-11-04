//Initialisation
var accounts;
var accountID = 0;
var dem = MazarsContract.deployed();
//sessionStorage["firstVisit"] = 0;

/* Générer les adresses des comptes */
function getAccounts(accounts){
  //Première visite du owner
  if(sessionStorage["firstVisit"] == null){
    var textFile = null,
        makeTextFile = function (text) {
        var data = new Blob([text], {type: 'text/plain'});
        // If we are replacing a previously generated file we need to
        // manually revoke the object URL to avoid memory leaks.
        if (textFile !== null) {
          window.URL.revokeObjectURL(textFile);
        }
        textFile = window.URL.createObjectURL(data);
        return textFile;
      }
      var link = document.getElementById('downloadlink');
      link.href = makeTextFile(accounts);
      link.style.display = 'block';
      sessionStorage["firstVisit"] = 1;
  }
  //Renseigner les adresses générer par testrpc au contrat
  for (var i = 0; i < accounts.length; i++) {
    dem.setAdress(i, accounts[i], {from : accounts[i]} ).then(function(res){
      console.log("Set adress done for: " + i);
    });
    dem.SetMemberTrue({from : accounts[i]}).then(function(res){
      console.log("Set member done for: " + i);
    });
  }

}

/* Connexion */ //--> Se déclenche avec le btn Connexion
function connexion(){
  //Récuperation des identifiants
  var name = document.getElementById("name").value;
  var adress = document.getElementById("password").value; //address

  dem.connexion(name, {from: adress}).then(function(res){
    console.log(res);
    if(res == 'error'){
      alert('Aucun compte ne correspond à ces identifiants');
    }
    else if (res == 'member') {
      document.location.href="home_Member.html";
      sessionStorage["account"] = adress;
      sessionStorage["status"] = "member";
    }
    else{
      document.location.href="home_Owner.html";
      sessionStorage["account"] = adress;
      sessionStorage["status"] = "owner";
    }
  });

}

/* Permet d'afficher les propositions côté owner */
function refreshProposalsOwner() {

    dem.nbProposals().then(function(nbProposals) {  //Créer une fonction qui récupère le nombre de proposal dans le tableau proposals
        var array = _.range(nbProposals)
        Promise.map(array,
            function(index) {
                return dem.infoProposal(index, {from: sessionStorage["account"]})
            }).then(function(results) {
              for (var i = 0; i < results.length; i++) {
                //Ajout d'une nouvelles balises pour chaque proposition
                v_div_parent = document.getElementById("proposals");
                v_div_enfant = document.createElement("div");
                v_div_enfant.setAttribute("id", i);
                v_div_enfant.setAttribute("class", "proposal");
                v_div_parent.appendChild(v_div_enfant);

                //Si elle est executée => result + Fermé
                if(results[i][2] == true){
                  //Verification du résultat
                  var adopted;
                  if (results[i][4] == true){
                    adopted = "Egalit\351.";
                  }
                  else if(results[i][3] == false && results[i][4] == false){
                    adopted = "Non admise.";
                  }
                  else{
                    adopted = "Admise.";
                  }
                  //Affichage + remove et detail
                  document.getElementById(""+ i + "").innerHTML =
                  "<b>Description:</b>" + "\u00A0\u00A0'" + results[i][0] + "'" + blankSpace()   +"' Resultat: '" + adopted + "'"+ blankSpace() + "Etat: Ferm\351e au vote." + blankSpace()
                  +"<a href='details.html'><button id='"+ i +"' value='"+ i +"' class='btn btn-default' onClick='saveId(this)' >Details</button></a>" + blankSpace()
                  +"<button id='"+ i +"' value='"+ i +"' class='btn btn-default' align='center' onClick='remove(this)'>Remove</button>"
                  + "<br> <HR size=6px>";
                }
                else{
                  //Si elle n'est pas encore ouverte => boutton ouvrir + supp
                  if(convertTimestamp(results[i][1]) == "Etat: Non ouverte." ){
                    document.getElementById(""+ i + "").innerHTML =
                    "<b>Description:</b>" + "\u00A0\u00A0'" + results[i][0] + "'"+ blankSpace() + convertTimestamp(results[i][1]) + blankSpace()
                    //bouton
                    +"<button id='"+ i +"' value='"+ i +"' class='btn btn-default' align='center' onClick='open_(this)'>Open</button>" + blankSpace()
                    +"<button id='"+ i +"' value='"+ i +"' class='btn btn-default' align='center' onClick='remove(this)'>Remove</button>"
                    + "<br> <HR size=2px>";
                  }
                  //Fermé au vote => bouton éxécuter
                  else if(convertTimestamp(results[i][1]) == "Ferm\351e au vote."){
                    document.getElementById(""+ i + "").innerHTML =
                    "<b>Description:</b>" + "\u00A0\u00A0'" + results[i][0] + "'"+ blankSpace() + convertTimestamp(results[i][1]) + blankSpace()
                    //bouton
                    +"<button id='"+ i +"' value='"+ i +"' class='btn btn-default' align='center' onClick='execute(this)'>Execute</button>" + blankSpace()
                    + "<br> <HR size=2px>";
                  }
                  //Si ouverte => heure de fin + boutton vote
                  else{
                    //Verification de vote
                    var disable = "";
                    if(results[i][5]){ disable = "disabled"; }
                    console.log("hAS VOTED: " + results[i][5]);
                    document.getElementById(""+ i + "").innerHTML =
                    "<b>Description:</b>" + "\u00A0\u00A0'" + results[i][0] + "'"+ blankSpace() + convertTimestamp(results[i][1]) + blankSpace()
                    //bouton
                    +"<a href='vote.html'><button id='bouton"+ i +"' name='vote' value='"+ i +"' class='btn btn-default' align='center' "+ disable +" onClick='saveId(this)'>Vote</button></a>"
                    + "<br> <HR size=2px>";
                  }
                }
              }
            console.log('refreshProposals Done!');
        })
    })
};

/* Permet d'afficher les propositions côté membre */
function refreshProposals() {
    dem.nbProposals().then(function(nbProposals) {  //Créer une fonction qui récupère le nombre de proposal dans le tableau proposals
        var array = _.range(nbProposals)
        Promise.map(array,
            function(index) {
                return dem.infoProposal(index, {from: sessionStorage["account"]})
            }).then(function(results) {
              for (var i = 0; i < results.length; i++) {
                //Ajout d'une nouvelles balises pour chaque proposition
                v_div_parent = document.getElementById("proposals");
                v_div_enfant = document.createElement("div");
                v_div_enfant.setAttribute("id", i);
                v_div_parent.appendChild(v_div_enfant);

                //Si elle est executée => result + Fermé
                if(results[i][2] == true){
                  //Verification du résultat
                  var adopted;
                  if (results[i][4] == true){
                    adopted = "Egalit\351.";
                  }
                  else if(results[i][3] == false && results[i][4] == false){
                    adopted = "Non admise.";
                  }
                  else{
                    adopted = "Admise.";
                  }
                  //Affichage
                  //Affichage sans button
                  document.getElementById(""+ i + "").innerHTML =
                  "<b>Description:</b>" + "\u00A0\u00A0'" + results[i][0] + "'"+ blankSpace() + "<br>"
                  +"<a href='details_Member.html'><button id='"+ i +"' value='"+ i +"' class='btn btn-default' onClick='saveId(this)'>Details</button></a>"+ blankSpace()
                  + "<br> <HR size=2px>";
                }
                else{
                  //Si non ouverte ou fermé => notif
                  if(convertTimestamp(results[i][1]) == "Etat: Non ouverte." || convertTimestamp(results[i][1]) == "Ferm\351e au vote."){
                    document.getElementById(""+ i + "").innerHTML =
                    "<b>Description:</b>" + "\u00A0\u00A0'" + results[i][0] + "'"+ blankSpace() + "<br>"
                     + convertTimestamp(results[i][1]) + blankSpace()
                    + "<br> <HR size=2px>";
                  }
                  //Si ouverte => heure de fin + vote
                  else{
                    //Verification de vote
                    var disable;
                    var disable = "";
                    if(results[i][5]){ disable = "disabled"; }
                    console.log(disable);
                    console.log("hAS VOTED: " + results[i][5]);
                    document.getElementById(""+ i + "").innerHTML =
                    "<b>Description:</b>" + "\u00A0\u00A0'" + results[i][0] + "'"+ blankSpace() + "<br>"
                     + convertTimestamp(results[i][1]) + "<br>"
                    //boutton VOTE
                    +"<a href='vote.html'><button id='bouton"+ i +"' name='vote' value='"+ i +"' class='btn btn-default' onClick='saveId(this)' " + disable  +">Vote</button></a>"
                    +  "<br> <HR size=2px>";
                  }
                }
              }

            //Affichage temps
            //"Index: " + i + blankSpace() + "Description: '" + x[0] + "'"+ blankSpace() + convertTimestamp(x[1])))
            //+'<br> <br>'
            /*//sessionStorage["proposal"])
            +'<button onClick="chooseProposal()">Vote</button>';*/
            console.log('refreshProposals Done!');
        })
    })
};

/* Enregistre l'id de la proposition sélectionée */
function saveId(form_element){
  sessionStorage["proposalId"] = form_element.value;
}

/* Affiche les détails des resultats du vote */
function displayDetails(){
  sessionStorage["yes"] = 0;
  sessionStorage["no"] = 0;

  for (var i = 0; i < 2; i++) {
    dem.score(sessionStorage["proposalId"], i, {from : sessionStorage["account"]}).then(function(result){
      //console.log(result);
      if(result){
        sessionStorage["yes"] = parseInt(sessionStorage["yes"]) + 1;
      }
      else{
        sessionStorage["no"] = parseInt(sessionStorage["no"]) + 1;
      }
    });
  }

  dem.details(parseInt(sessionStorage["proposalId"]), {from : sessionStorage["account"]}).then(function(result){
    //p.IsCandidat, p.description, p.end, p.votes[0], p.votes[1], p.votes[2], p.NbVoters, p.IsAdopted
    //description
    console.log(sessionStorage["yes"]);
    document.getElementById('description').innerHTML = "<h4>" + result[0] + "</h4>";
    //score si candidat (nom1, nom2..)
    var result_ = "Non Admise";
    if(result[1]){result_ = "Admise";}

      document.getElementById('col_1').innerHTML = "No";
      document.getElementById('col_2').innerHTML = "Yes";
      document.getElementById('col_3').innerHTML = "Joker";
      document.getElementById('total').innerHTML = "Total";
      document.getElementById('col_1_result').innerHTML = sessionStorage["no"];
      document.getElementById('col_2_result').innerHTML = sessionStorage["yes"];
      document.getElementById('col_3_result').innerHTML = 0;
      document.getElementById('col_total_result').innerHTML = parseInt(sessionStorage["no"]) + parseInt(sessionStorage["yes"]);

      document.getElementById('result').innerHTML = "<h1>" + result_ +  "</h1>";
  });
}

/* Affiche la proposition soumise au vote */
function displayVote(){
  //Affichage de la proposition choisie
  dem.infoProposal(sessionStorage["proposalId"]).then(function(result) {
        document.getElementById("description").innerHTML = result[0];
        document.getElementById("time").innerHTML =  convertTimestamp(result[1]);
        console.log('displayResults Done!');
  })
}

/* Permet de voter */
function vote(form_element){
  //var decision = form_element.id;
  var index_choice;
  //Ajouter une condition si déjà voter
  if(form_element.id == "no"){
    index_choice = false;
  }
  else if(form_element.id == "yes"){
    index_choice = true;
  }
  else{
    index_choice = false;
  }
  console.log(sessionStorage["account"]);
  dem.vote( parseInt(sessionStorage["proposalId"]), index_choice, {from: sessionStorage["account"]}).then( function(res){
      console.log('Done!');
      console.log('res :', res);
      if (sessionStorage["status"] == "owner") {
        document.location.href ="home_Owner.html";
      }
      else{
        document.location.href ="home_Member.html";
      }
  });
}

/* Supprime une proposition */
function remove(form_element){
  //Test initialisation du temps
    dem.removeProposal(form_element.id, {from: sessionStorage["account"]}).then( function(res){
        console.log('Done!');
        console.log('res :', res);
    })
    console.log("Transaction sent");
    alert("La proposition " + form_element.id + " a \351t\351 supprim\351e.")
    //Recharger la page
    window.location.reload();
}

/* Ouvre une proposition */
function open_(form_element){
  //Test initialisation du temps
  console.log("Marche");
  if(sessionStorage["time"] != null){
    dem.openProposal(form_element.id, {from: sessionStorage["account"]}).then( function(res){
        console.log('Done!');
        console.log('res :', res);
    })
    console.log("Transaction sent");
    alert("La proposition " + form_element.id + " est maintenant ouverte aux vote pour "+ sessionStorage["time"] +" minutes.")
  }
  else{
    alert("Vous n'avez pas initialiser de temps de vote.");
  }
  //Recharger la page
  window.location.reload();

}

/* Execute la proposition */
function execute(form_element){
  //Verification
  sessionStorage["IsVerified"] = false;
  //verification(form_element.id);

  dem.execute(form_element.id, {from: sessionStorage["account"]}).then( function(res){
      console.log('Done!');
      console.log('res :', res);
  })
  console.log("Transaction sent");
  alert("Votre proposition a bien \351t\351 \351x\351cut\351e.");
  //Recharger la page
  window.location.reload();
}

/* Vérifie le quorum (float non accpter en solidity) */
function verification(index){

  dem.infoVerification(index).then (function(res){ //totalPoints_, p.IsCandidat, p.NbVoters, p.votes[1]
    var IsApprouved;
    var Quorum;
    //Approbation
    if(!res[1]){
      if(res[3] >= (50/100+1) * res[0]){ IsApprouved = true; }
      else{ IsApprouved = false; }
    }
    else{
      if(res[3] >= (66/100) * total){ IsApprouved = true; }
      else{ IsApprouved = false; }
    }
    //Quorum
    if(!res[1]){
      if(res[2] >= (25/100)*total){ Quorum = true; }
      else{ Quorum = false; }
    }
    else{
      if(res[2] >= (50/100)*total){ Quorum = true; }
      else{ Quorum = false; }
    }
    //SI les deux conditions sont validées
    if(IsApprouved && Quorum){
      sessionStorage["IsVerified"] = true;
    }
    else{
      sessionStorage["IsVerified"] = false;
    }
  })
}

/* Ajouter une proposition */ //-> Vérifier les nom du from et appel de la fonction convertCsv
function addProposal(){
  //Récupération des infos du form
  var description = document.getElementById("description").value;
  //If comiteExecutif
  if(document.getElementById('comiteExecutif').checked){
    var IsComite = true;
    //Enregistrements des candidats
    function handleFileSelect(evt) {
      var file = evt.target.files[0];
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        complete: function(results) {
         for(var i = 0; i < 3; i++){
           //Ajout candidat + sa lliste
           dem.setCandidat( i, results.data[i]["nom"], results.data[i]["membre1"], results.data[i]["membre2"]).then(function(res){
             console.log("Done!");
            });
         }
       }
      });
    }
    $(document).ready(function(){
      $("#csv-file").change(handleFileSelect);
    });
  }
  else{
    var IsComite = false;
  }
  //Enregistrement de la proposition
  dem.addProposal_Interface(description, IsComite, {from: sessionStorage["account"]}).then(function(res){
      console.log('Done!');
      console.log('res :', res);
  })
  console.log("Transaction sent");
  alert("La proposition a \351t\351 ajout\351 par le compte suivant : " + sessionStorage["account"]);
  //Recharger la page
  window.location.reload();
}

/* Ces fonctions vont permettre la lecture d'un csv */
function handleFiles(files) {
	// Check for the various File API support.
	if (window.FileReader) {
		// FileReader are supported.
		getAsText(files[0]);
	} else {
		alert('FileReader are not supported in this browser.');
	}
}

function getAsText(fileToRead) {
	var reader = new FileReader();
	// Handle errors load
	reader.onload = loadHandler;
	reader.onerror = errorHandler;
	// Read file into memory as UTF-8
	reader.readAsText(fileToRead);
}

function loadHandler(event) {
	var csv = event.target.result;
	processData(csv);
}

function processData(csv) {
    var allTextLines = csv.split(/\r\n|\n/);
    var lines = [];
    while (allTextLines.length) {
        lines.push(allTextLines.shift().split(','));
    }
	console.log(lines);
	drawOutput(lines);
}

function errorHandler(evt) {
	if(evt.target.error.name == "NotReadableError") {
		alert("Canno't read file !");
	}
}
//result and call contract
function drawOutput(lines){
	//Clear previous data
	document.getElementById("output").innerHTML = "";
	var table = document.createElement("table");

  for (var i = 0; i < lines.length - 1; i++) {
    var row = table.insertRow(-1);
    var cell1 = row.insertCell(-1);
    var cell2 = row.insertCell(-1);
    cell1.innerHTML = lines[i][0];
    cell2.innerHTML = lines[i][1];
    dem.setMembersData( i, lines[i][0], parseInt(lines[i][1]), {from: sessionStorage["account"]}).then(function(res){
        console.log("Contract value:");
        console.log("name:" + res[0] + "  points:" + res[1] );
     });
  }
  document.getElementById("output").appendChild(table);
}

/* Transfère un proxy */
function proxy(){
  var nameReceiver = getElementById("name").value;
  var adresseReciever;
  var IsFound = false;
  var i =0;
  //find the adress of the reciever
  while (IsFound || i < 10) {
    dem.findAddress(i).then ( function(res){
      if(res[0] == nameReceiver){
        adresseReciever = res[1];
        IsFound = true;
        //Appel de proxy
        dem.proxy(nameReceiver, adresseReciever).then (function(res){
          alert("Vos points ont été tranférés !");
          document.location.href="connexion.html";
        })
      }
      i += 1;
    })
  }

}

/*Permet de modifier le temps de vote d'une proposition */ //-> Se déclenche ac le btn ajouter
function newVotingTime(){
    //Récupération du temps
    var newVotingTime_ = document.getElementById("tempsAdd").value;

    dem.setVotingTime(newVotingTime_, {from: sessionStorage["account"]}).then( function(res){
      console.log('Done!');
      console.log('res :', res);
    })
    console.log("Transaction sent");
    //Enregistrement dans un sessionStorage
    alert("Le temps de vote est d\351sormais de: "+ newVotingTime_ + " minutes");
    sessionStorage["time"] = newVotingTime_;
}

/* Convertie le temps de vote du smart contract(ms) en date (JJ/MM/AAAA ?h??) */
function convertTimestamp(timestamp) {
  //Non ouverte
  if(timestamp == 0){
    return "Etat: Non ouverte.";
  }
  else{
    var d = new Date(timestamp * 1000),	// Convert the passed timestamp to milliseconds
  		yyyy = d.getFullYear(),
  		mm = ('0' + (d.getMonth() + 1)).slice(-2),	// Months are zero based. Add leading 0.
  		dd = ('0' + d.getDate()).slice(-2),			// Add leading 0.
  		hh = d.getHours(),
  		h = hh,
  		min = ('0' + d.getMinutes()).slice(-2),		// Add leading 0.
  		ampm = 'AM',
  		time;

      //Comparaison des deux heures
      var now = new Date();
      var anneeRef   = now.getFullYear();
      var moisRef    = now.getMonth() + 1;
      var jourRef    = now.getDate();
      var heureRef   = now.getHours();
      var minuteRef  = now.getMinutes();

      var timeNow = "" + heureRef + ":" + minuteRef;
      var timeSet = "" + hh + ":" + min;
      var result = dateCompare(timeNow, timeSet);

    //création de la var de sortie
    var time;

    //Fermée
    if(result == 1){
      return time = "Ferm\351e au vote.";
    }
    //Ouverte
  	else{
      // ie: 2013-02-18, 8:35 AM
    	time = 'End at: ' + yyyy + '-' + mm + '-' + dd + ',  ' + h + ':' + min + ' ';
      return time;
    }
  }
}

/* Compare la date d'ouverture et la date actuelle pour la fermeture de les proposition */
function dateCompare(time1,time2) {
  var t1 = new Date();
  var parts = time1.split(":");
  t1.setHours(parts[0],parts[1],0,0);
  var t2 = new Date();
  parts = time2.split(":");
  t2.setHours(parts[0],parts[1],0,0);

  // returns 1 if greater, -1 if less and 0 if the same
  if (t1.getTime()>t2.getTime()) return 1;
  if (t1.getTime()<t2.getTime()) return -1;
  return 0;
}

function blankSpace(){
  return "\u00A0\u00A0\u00A0\u00A0\u00A0"
}

//Exécute les bonnes fonctions selon de l'interface lors du rechargemment de la page
window.onload = function() {  //gestionnaire d'évènement pour l'évènement load (chargement) de la fenêtre
  web3.eth.getAccounts(function(err, accs) {
    if (err != null) {
      alert("There was an error fetching your accounts.");
      return;
    }
    if (accs.length == 0) {
      alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
      return;
    }

    //Initialisation des comptes
    accounts = accs;
    account = accounts[accountID];
    //Récupération du nom de la page courante
    var url = document.URL;
    var debut = url.indexOf("build") + 6;
    var fichier = url.substring(debut);

    //Index
    if(fichier == "connexion.html"){
       getAccounts(accounts);
    }
    //Propositions
    else if(fichier == "home_Member.html"){
      refreshProposals();
    }
    else if (fichier == "home_Owner.html") {
      refreshProposalsOwner();
    }
    //Page vote
    else if(fichier == "vote.html"){
      displayVote();
    }
    else if(fichier == "details.html" || fichier == "details_Member.html"){
      displayDetails();
    }

  });
}
