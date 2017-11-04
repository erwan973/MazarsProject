pragma solidity ^0.4.6;

contract MazarsContract {

  //Structures
  struct Voter{
    string name;
    uint points;
    uint proxy;
    address adresse;
    bool IsMember;
  }
  struct Proposal{
    string description;
    mapping (address => bool) HasVoted;
    bool [] votes;
    bool IsAdopted;
    bool IsExecuted;
    bool IsCandidat;
    bool IsMember;
    bool equality;
    uint end;
    string [] liste;
    uint NbVoters;
  }
  struct Candidat{
    string name;
    string [] liste;
    bool IsWinner;
  }

  //Attributs
  address public owner;
  uint public votingTimeInMinutes;
  mapping (address => Voter) public members;
  mapping (uint => address) public members_Index;
  Proposal [] public proposals;
  Candidat [] public candidats;

  // Constructeur
  function MazarsContract() {
      //Initialisation du owner
      owner = msg.sender;
      //Ajout par défaut des comptes créés au contrat
      SetMemberTrue();
  }

  //Restrictions
  modifier ownerOnly(){
      if (msg.sender != owner) throw;
      _;
  }
  modifier memberOnly(){
      if (!members[msg.sender].IsMember) throw;
      _;
  }
  modifier isOpen(uint index) {
      if(now > proposals[index].end)  throw;
      _;
  }
  modifier isClosed(uint index) {
      if(now < proposals[index].end) throw;
      _;
  }
  modifier didNotVoteYet(uint index) {
      if(proposals[index].HasVoted[msg.sender]) throw;
      _;
  }

  //Fonctions:

  /* Permet de modifier le temps de vote */
  function setVotingTime(uint newVotingTime) ownerOnly() {
      votingTimeInMinutes = newVotingTime;
  }

  /* Permet d'ouvrir une proposition */
  function openProposal(uint index){
    Proposal p = proposals[index];
    p.end = now + votingTimeInMinutes * 1 minutes;
  }

  /* Permet de supprimer une proposition */
  function removeProposal(uint index) {
      if(proposals.length -1 != index){
        for (uint i = index; i < proposals.length - 1; i++){
            proposals[i] = proposals[i+1];
        }
      }
      //delete proposals[proposals.length - 1];
      proposals.length--;
  }

  /* Récupère les données interfaces et ajoute une proposition */
  function addProposal_Interface(string description, bool IsCandidat){
    string []  memory liste_candidat;
    addProposal_Contract(description, false, IsCandidat, liste_candidat);
  }

  /* Ajoute une proposition avec les données contrat */
  function addProposal_Contract (string description, bool IsMember, bool IsCandidat, string [] liste_candidat) private{
    uint newIndex = proposals.length++;
    Proposal p = proposals[newIndex];
    // Donner la description
    p.description = description;
    // Initialisation de fin de vote à fermée
    p.end = 0;

    //Si Prop pour un membre de la liste
    if (IsMember){
      p.IsMember = IsMember;
    }
    //Si Prop Candidat
    else if (IsCandidat){
      p.IsCandidat = IsCandidat;
      //Remplir la liste
      for(uint i = 0; i < candidats.length; i++){
        p.liste[i] = candidats[i].name;
      }
      //p.votes.length = candidats.length;
      //p.votes = new uint[](3)
    }
  }

  /* Permet d'enregistrer les votes en fonctions des cas */
  function vote (uint index, bool vote){
    proposals[index].votes.push(vote);
    proposals[index].HasVoted[msg.sender] = true;
  }

  /* Permet de récupérer le nombre de points de tout les votants*/
  function totalPoints () returns(uint){
    uint points = 0;
    for(uint i = 0; i < 10; i++){
      points += members[members_Index[i]].points;
    }
    return points;
  }


  /* Permet de gérer les proxys */
  function proxy (string nameReciver, address adresse_reciever){
    uint points_sender = members[msg.sender].points;

    if(members[adresse_reciever].proxy < 5){
      //Ajout points
      members[adresse_reciever].points += points_sender;
      //Ajout proxy
      members[adresse_reciever].proxy += 1;
      //Retirer le sender des votants
      members[msg.sender].IsMember = false;
    }
  }

  /* Trouve l'adresse d'un votant à partir de son nom */
  function findAddress(uint index) returns(string, address){
    return (members[members_Index[index]].name, members[members_Index[index]].adresse);
  }

  /* Trouver le candidat gagnant */
  function findWinner (uint index) returns (uint){
    Proposal p = proposals[index];
    uint index_winner = 0;
    uint length = 3;

    for(uint i = 1; i < length; i++){ //p.votes.length
      if(p.votes[i] > p.votes[i-1]){
        index_winner = i;
      }
    }
    return index_winner;
  }

  /* Trouver un membre d'une liste */
  function findMember (string nom, uint index) returns(uint){
    Candidat c = candidats[index];
    uint index_member = 0;

    for(uint i = 0; i < c.liste.length; i++){
      bool IsEqual = stringsEqual(nom, c.liste[i]);
      if(IsEqual){
        index_member = i;
      }
    }
    return index_member;
  }

  /* Chercher si deux string sont égaux */
  function stringsEqual(string memory _a, string memory _b) internal returns (bool) {
    bytes memory a = bytes(_a);
    bytes memory b = bytes(_b);
    if (a.length != b.length)
      return false;
    // @todo unroll this loop
    for (uint i = 0; i < a.length; i ++)
      if (a[i] != b[i])
        return false;
    return true;
  }

  /* Execute le resultat */
  function execute (uint index){
    uint yes;
    uint no;
    bool[] votes = proposals[index].votes;

    // On compte les pour et les contre
    for(uint counter = 0; counter < votes.length; counter++) {
        if(votes[counter]) {
            yes++;
        } else {
            no++;
        }
    }
    if(yes > no) {
       proposals[index].IsAdopted = true;
    }
    else if( yes == no){
      proposals[index].equality = true;
    }
    //A été éxécuter
    proposals[index].IsExecuted = true;
  }

  /* Permet d'identifier le statut */
  function connexion (string name) public constant returns (string){
    if(msg.sender == owner){
      return 'owner';
    }
    //Appartien aux votant ET est un associé répertorié
    else if(members[msg.sender].IsMember){
      return 'member';
    }
    else{
      return 'error';
    }
  }

  /* Permet de remplir les membres */
  function setMembersData(uint index, string name, uint points) public constant returns (address, uint) {
    members[members_Index[index]].name = name;
    members[members_Index[index]].points = points;
    members[members_Index[index]].adresse = members_Index[index];

    return (members_Index[index], members[members_Index[index]].points);
  }

  /* Permet de remplir la liste de candidats */
  function setCandidat(string name, string membre_1, string membre_2){ //Limité à deux membres pour les tests
    //Fill the array
    uint index = candidats.length ++;
    candidats[index].name = name;
    candidats[index].liste[1] = membre_1;
    candidats[index].liste[2] = membre_2;
  }

  /* Permet de stocker les adresses créer par testrpc */
  function setAdress(uint i, address adresse){
    members_Index[i] = adresse;
  }

  /*Permet d'associer les comptes générés par TestRPC au contrat */
  function SetMemberTrue(){
    members[msg.sender].IsMember = true;
  }

/* *** Fonctions de renvoie à l'interface *** */

  /* Renvoie le nombre de propositions */
  function nbProposals() constant  returns (uint){
    if(proposals.length > 0){
      return proposals.length;
    }
    return 0;
  }

  /* Renvoie les principales informations d'une proposition */
  function infoProposal(uint index) public constant returns(string, uint, bool, bool, bool, bool) {
    Proposal p = proposals[index];
    return (p.description, p.end, p.IsExecuted, p.IsAdopted, p.equality, p.HasVoted[msg.sender]);
  }

  /* Renvoie les details d'une proposition qui a été votée */
  function details(uint index) public constant returns (string, bool){
    Proposal p = proposals[index];
    if(p.equality){
      return (p.description, p.equality);
    }
    else{
      return (p.description, p.IsAdopted);
    }
  }

  /*Score*/
  function score(uint index_prop, uint index_vote) public constant returns(bool){
    Proposal p = proposals[index_prop];
    return(p.votes[index_vote]);
  }


}
